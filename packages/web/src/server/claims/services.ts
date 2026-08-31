import type {
  AnalyzeReceiptResponse,
  CreateClaimResponse,
  ListClaimsResponse,
  PolicyOutcome,
  ProcessClaimResponse,
} from '@tali/shared';
import { ZodError } from 'zod';

import { ServerError, isServerError } from '../errors';
import { evaluatePolicy } from '../policy/evaluate';
import type { ReceiptAnalyzer } from '../receipts/gemini';
import { hashReceipt, type ReceiptMimeType } from '../receipts/hash';
import { toReceiptAnalysis } from '../receipts/schema';
import type {
  ClaimRepository,
  MandateReader,
  ProcessedClaimState,
  ReceiptStore,
} from './ports';
import {
  eventIdSchema,
  parseCreateClaimRequest,
  parseProcessClaimInput,
  suiAddressSchema,
} from './validation';

export interface AnalyzeReceiptInput {
  eventId: string;
  submitter: string;
  bytes: Uint8Array;
  mimeType: ReceiptMimeType;
}

function databaseError(error: unknown): ServerError {
  return isServerError(error)
    ? error
    : new ServerError(
        'database_failed',
        500,
        'The database operation failed',
        { cause: error },
      );
}

export function createAnalyzeReceiptService(deps: {
  analyzer: ReceiptAnalyzer;
  claims: ClaimRepository;
  receipts: ReceiptStore;
}): (input: AnalyzeReceiptInput) => Promise<AnalyzeReceiptResponse> {
  return async (input) => {
    let eventId: string;
    let submitter: string;
    try {
      eventId = eventIdSchema.parse(input.eventId);
      submitter = suiAddressSchema.parse(input.submitter);
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Invalid event or submitter', {
        cause: error,
      });
    }

    try {
      await deps.claims.assertEventExists(eventId);
      await deps.claims.assertActiveMember(eventId, submitter);
    } catch (error) {
      throw databaseError(error);
    }

    let receiptHash: string;
    try {
      receiptHash = hashReceipt(input.bytes);
    } catch (error) {
      throw new ServerError('unsupported_receipt', 415, 'Receipt image is empty', {
        cause: error,
      });
    }

    let duplicate;
    try {
      duplicate = await deps.claims.findDuplicateReceipt(eventId, receiptHash);
    } catch (error) {
      throw databaseError(error);
    }
    if (duplicate) {
      return {
        analysis: duplicate.analysis,
        storagePath: duplicate.storagePath,
        duplicateOf: duplicate.claimId,
      };
    }

    let analysis;
    try {
      const fields = await deps.analyzer.analyze({
        bytes: input.bytes,
        mimeType: input.mimeType,
      });
      analysis = toReceiptAnalysis(fields, receiptHash);
    } catch (error) {
      throw new ServerError(
        'analysis_failed',
        502,
        'Receipt analysis failed',
        { cause: error },
      );
    }

    let storagePath: string;
    try {
      storagePath = await deps.receipts.upload({
        eventId,
        receiptHash,
        bytes: input.bytes,
        mimeType: input.mimeType,
      });
    } catch (error) {
      throw new ServerError('storage_failed', 500, 'Receipt upload failed', {
        cause: error,
      });
    }

    return { analysis, storagePath, duplicateOf: null };
  };
}

export function createClaimService(deps: {
  claims: ClaimRepository;
}): (input: unknown) => Promise<CreateClaimResponse> {
  return async (input) => {
    let request;
    try {
      request = parseCreateClaimRequest(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ServerError('invalid_request', 400, 'Invalid claim request', {
          cause: error,
        });
      }
      throw error;
    }

    try {
      await deps.claims.assertEventExists(request.eventId);
      await deps.claims.assertActiveMember(request.eventId, request.submitter);
      return { claim: await deps.claims.create(request) };
    } catch (error) {
      throw databaseError(error);
    }
  };
}

export function createListClaimsService(deps: {
  claims: ClaimRepository;
  receipts: ReceiptStore;
}): (input: { eventId: string; viewer: string }) => Promise<ListClaimsResponse> {
  return async (input) => {
    let eventId: string;
    let viewer: string;
    try {
      eventId = eventIdSchema.parse(input.eventId);
      viewer = suiAddressSchema.parse(input.viewer);
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Invalid event or viewer', {
        cause: error,
      });
    }

    let storedClaims;
    try {
      await deps.claims.assertEventExists(eventId);
      await deps.claims.assertActiveMember(eventId, viewer);
      storedClaims = await deps.claims.listByEvent(eventId);
    } catch (error) {
      throw databaseError(error);
    }

    try {
      const claims = await Promise.all(
        storedClaims.map(async ({ claim, storagePath }) => ({
          ...claim,
          receiptUrl: await deps.receipts.createSignedUrl(storagePath, 300),
        })),
      );
      return { claims, cursor: null };
    } catch (error) {
      throw new ServerError(
        'storage_failed',
        500,
        'Receipt URL creation failed',
        { cause: error },
      );
    }
  };
}

export function createProcessClaimService(deps: {
  claims: ClaimRepository;
  mandates: MandateReader;
  now?: () => number;
}): (input: unknown) => Promise<ProcessClaimResponse> {
  return async (input) => {
    let request: { claimId: string; processor: string };
    try {
      request = parseProcessClaimInput(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ServerError('invalid_request', 400, 'Invalid claim process request', {
          cause: error,
        });
      }
      throw error;
    }

    let context;
    try {
      context = await deps.claims.getProcessContext(request.claimId);
    } catch (error) {
      throw databaseError(error);
    }

    if (request.processor.toLowerCase() !== context.event.treasurer.toLowerCase()) {
      throw new ServerError(
        'processor_forbidden',
        403,
        'Only the event treasurer may process claims',
      );
    }

    if (context.claim.decision) {
      return {
        claim: context.claim,
        decision: context.claim.decision,
        payment: null,
      };
    }
    if (context.claim.state !== 'submitted') {
      throw new ServerError(
        'processing_conflict',
        409,
        'Claim is not available for processing',
      );
    }

    let mandate;
    try {
      mandate = await deps.mandates.read(context.event.mandateId);
      if (mandate.id.toLowerCase() !== context.event.mandateId.toLowerCase()) {
        throw new Error('Mandate object ID does not match the event');
      }
    } catch (error) {
      throw new ServerError(
        'mandate_read_failed',
        502,
        'The current Sui mandate could not be read',
        { cause: error },
      );
    }

    const decision = evaluatePolicy({
      claim: context.claim,
      event: context.event,
      mandate,
      exactDuplicate: false,
      nowMs: deps.now?.() ?? Date.now(),
    });
    const stateByOutcome: Record<PolicyOutcome, ProcessedClaimState> = {
      auto_pay: 'approved',
      review: 'awaiting_review',
      reject: 'rejected',
    };

    let saved;
    try {
      saved = await deps.claims.saveDecision({
        claimId: request.claimId,
        decision,
        state: stateByOutcome[decision.outcome],
      });
    } catch (error) {
      throw databaseError(error);
    }
    if (!saved.claim.decision) {
      throw new ServerError(
        'processing_conflict',
        409,
        'Claim processing did not store a decision',
      );
    }

    return {
      claim: saved.claim,
      decision: saved.claim.decision,
      payment: null,
    };
  };
}
