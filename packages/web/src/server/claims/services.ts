import type {
  AnalyzeReceiptResponse,
  CreateClaimResponse,
  ListClaimsResponse,
} from '@tali/shared';
import { ZodError } from 'zod';

import { ServerError, isServerError } from '../errors';
import type { ReceiptAnalyzer } from '../receipts/gemini';
import { hashReceipt, type ReceiptMimeType } from '../receipts/hash';
import { toReceiptAnalysis } from '../receipts/schema';
import type { ClaimRepository, ReceiptStore } from './ports';
import {
  eventIdSchema,
  parseCreateClaimRequest,
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
      return { claim: await deps.claims.create(request) };
    } catch (error) {
      throw databaseError(error);
    }
  };
}

export function createListClaimsService(deps: {
  claims: ClaimRepository;
  receipts: ReceiptStore;
}): (eventId: string) => Promise<ListClaimsResponse> {
  return async (inputEventId) => {
    let eventId: string;
    try {
      eventId = eventIdSchema.parse(inputEventId);
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Invalid event ID', {
        cause: error,
      });
    }

    let storedClaims;
    try {
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
