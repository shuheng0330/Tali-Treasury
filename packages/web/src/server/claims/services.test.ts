import type {
  Claim,
  CreateClaimRequest,
  MandateView,
  PolicyDecision,
  ReceiptAnalysis,
} from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../errors';
import type { ClaimRepository, ReceiptStore } from './ports';
import {
  createAnalyzeReceiptService,
  createClaimService,
  createListClaimsService,
  createProcessClaimService,
} from './services';

const eventId = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
const submitter = `0x${'a'.repeat(64)}`;
const treasurer = `0x${'b'.repeat(64)}`;
const mandateId = `0x${'1'.repeat(64)}`;
const nowMs = Date.UTC(2026, 7, 31, 7);
const receiptHash =
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const storagePath = `${eventId}/${receiptHash}.png`;

const analysis: ReceiptAnalysis = {
  merchant: 'Campus Print Shop',
  amount: '4500000',
  currency: 'MYR',
  receiptDate: '2026-08-30',
  category: 'printing',
  confidence: 0.96,
  uncertainFields: [],
  warnings: [],
  receiptHash,
  fuzzyKey: 'campus print shop|2026-08-30|4500000',
};

const claim: Claim = {
  id: '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7',
  eventId,
  submitter,
  submitterName: 'Lim Wey Cheng',
  state: 'submitted',
  amount: '4500000',
  merchant: 'Campus Print Shop',
  receiptDate: '2026-08-30',
  category: 'printing',
  description: '',
  receiptUrl: null,
  receiptHash,
  analysis,
  decision: null,
  payment: null,
  createdAtMs: 1_788_048_000_000,
  updatedAtMs: 1_788_048_000_000,
};

const mandate: MandateView = {
  id: mandateId,
  coinType: '0xa1::usdc::USDC',
  initialBudget: '100000000',
  remainingBudget: '80000000',
  amountSpent: '20000000',
  maxPerClaim: '5000000',
  expiryMs: Date.UTC(2026, 8, 5),
  revoked: false,
  approvedRecipients: [submitter],
  fetchedAtMs: nowMs,
};

const processContext = {
  claim,
  event: {
    treasurer,
    mandateId,
    allowedCategories: ['printing'] as const,
    startsAtMs: Date.UTC(2026, 7, 29),
    expiresAtMs: Date.UTC(2026, 8, 5),
  },
};

function createRequest(): CreateClaimRequest {
  return {
    eventId,
    submitter,
    amount: '4500000',
    merchant: 'Campus Print Shop',
    receiptDate: '2026-08-30',
    category: 'printing',
    description: '',
    storagePath,
    analysis,
  };
}

function createRepository(overrides: Partial<ClaimRepository> = {}): ClaimRepository {
  return {
    assertEventExists: vi.fn(async () => undefined),
    assertActiveMember: vi.fn(async () => undefined),
    findDuplicateReceipt: vi.fn(async () => null),
    create: vi.fn(async () => claim),
    listByEvent: vi.fn(async () => []),
    getProcessContext: vi.fn(),
    saveDecision: vi.fn(),
    ...overrides,
  };
}

function createReceiptStore(overrides: Partial<ReceiptStore> = {}): ReceiptStore {
  return {
    upload: vi.fn(async () => storagePath),
    createSignedUrl: vi.fn(async () => 'https://signed.example/receipt'),
    ...overrides,
  };
}

describe('createAnalyzeReceiptService', () => {
  it('checks active membership before duplicate lookup, Gemini, or upload', async () => {
    const calls: string[] = [];
    const claims = createRepository({
      assertEventExists: vi.fn(async () => {
        calls.push('event');
      }),
      assertActiveMember: vi.fn(async () => {
        calls.push('member');
        throw new ServerError('member_not_found', 403, 'Active event membership is required');
      }),
      findDuplicateReceipt: vi.fn(async () => {
        calls.push('duplicate');
        return null;
      }),
    });
    const analyzer = {
      analyze: vi.fn(async () => {
        calls.push('analyze');
        throw new Error('must not run');
      }),
    };
    const receipts = createReceiptStore({
      upload: vi.fn(async () => {
        calls.push('upload');
        return storagePath;
      }),
    });
    const analyzeReceipt = createAnalyzeReceiptService({ analyzer, claims, receipts });

    await expect(
      analyzeReceipt({
        eventId,
        submitter,
        bytes: Buffer.from('hello'),
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'member_not_found', status: 403 });
    expect(calls).toEqual(['event', 'member']);
  });

  it('returns an event-scoped duplicate without another Gemini call or upload', async () => {
    const claims = createRepository({
      findDuplicateReceipt: vi.fn(async () => ({
        claimId: claim.id,
        analysis,
        storagePath,
      })),
    });
    const analyzer = { analyze: vi.fn() };
    const receipts = createReceiptStore();
    const analyzeReceipt = createAnalyzeReceiptService({ analyzer, claims, receipts });

    await expect(
      analyzeReceipt({
        eventId,
        submitter,
        bytes: Buffer.from('hello'),
        mimeType: 'image/png',
      }),
    ).resolves.toEqual({ analysis, storagePath, duplicateOf: claim.id });
    expect(analyzer.analyze).not.toHaveBeenCalled();
    expect(receipts.upload).not.toHaveBeenCalled();
  });

  it('hashes, analyzes, and uploads a new private receipt in order', async () => {
    const calls: string[] = [];
    const claims = createRepository({
      assertEventExists: vi.fn(async () => {
        calls.push('event');
      }),
      assertActiveMember: vi.fn(async () => {
        calls.push('member');
      }),
      findDuplicateReceipt: vi.fn(async (_event, hash) => {
        calls.push(`duplicate:${hash}`);
        return null;
      }),
    });
    const analyzer = {
      analyze: vi.fn(async () => {
        calls.push('analyze');
        return {
          merchant: 'Campus Print Shop',
          amount: '4.50',
          currency: 'MYR',
          receiptDate: '2026-08-30',
          category: 'printing' as const,
          confidence: 0.96,
          uncertainFields: [],
          warnings: [],
        };
      }),
    };
    const receipts = createReceiptStore({
      upload: vi.fn(async (input) => {
        calls.push(`upload:${input.eventId}`);
        return storagePath;
      }),
    });
    const analyzeReceipt = createAnalyzeReceiptService({ analyzer, claims, receipts });

    await expect(
      analyzeReceipt({
        eventId,
        submitter,
        bytes: Buffer.from('hello'),
        mimeType: 'image/png',
      }),
    ).resolves.toEqual({ analysis, storagePath, duplicateOf: null });
    expect(calls).toEqual([
      'event',
      'member',
      `duplicate:${receiptHash}`,
      'analyze',
      `upload:${eventId}`,
    ]);
  });
});

describe('createClaimService', () => {
  it('rejects malformed or internally inconsistent input before repository access', async () => {
    const claims = createRepository();
    const createClaim = createClaimService({ claims });

    await expect(
      createClaim({ ...createRequest(), amount: '4500001' }),
    ).rejects.toMatchObject({ code: 'invalid_request', status: 400 });
    expect(claims.create).not.toHaveBeenCalled();
  });

  it('persists a valid shared CreateClaimRequest', async () => {
    const claims = createRepository();
    const createClaim = createClaimService({ claims });

    await expect(createClaim(createRequest())).resolves.toEqual({ claim });
    expect(claims.assertEventExists).toHaveBeenCalledWith(eventId);
    expect(claims.assertActiveMember).toHaveBeenCalledWith(eventId, submitter);
    expect(claims.create).toHaveBeenCalledWith(createRequest());
  });

  it('rejects an inactive member before claim insertion', async () => {
    const claims = createRepository({
      assertActiveMember: vi.fn(async () => {
        throw new ServerError('member_not_found', 403, 'Active event membership is required');
      }),
    });
    const createClaim = createClaimService({ claims });

    await expect(createClaim(createRequest())).rejects.toMatchObject({
      code: 'member_not_found',
      status: 403,
    });
    expect(claims.create).not.toHaveBeenCalled();
  });

  it('returns event_not_found before membership or insertion', async () => {
    const claims = createRepository({
      assertEventExists: vi.fn(async () => {
        throw new ServerError('event_not_found', 404, 'Event not found');
      }),
    });
    const createClaim = createClaimService({ claims });

    await expect(createClaim(createRequest())).rejects.toMatchObject({
      code: 'event_not_found',
      status: 404,
    });
    expect(claims.assertActiveMember).not.toHaveBeenCalled();
    expect(claims.create).not.toHaveBeenCalled();
  });

  it('preserves a race-safe duplicate repository error', async () => {
    const claims = createRepository({
      create: vi.fn(async () => {
        throw new ServerError('duplicate_receipt', 409, 'Receipt already claimed');
      }),
    });
    const createClaim = createClaimService({ claims });

    await expect(createClaim(createRequest())).rejects.toMatchObject({
      code: 'duplicate_receipt',
      status: 409,
    });
  });
});

describe('createListClaimsService', () => {
  it('signs only the private paths selected by the event query for 300 seconds', async () => {
    const claims = createRepository({
      listByEvent: vi.fn(async () => [{ claim, storagePath }]),
    });
    const receipts = createReceiptStore();
    const listClaims = createListClaimsService({ claims, receipts });

    await expect(listClaims({ eventId, viewer: submitter })).resolves.toEqual({
      claims: [{ ...claim, receiptUrl: 'https://signed.example/receipt' }],
      cursor: null,
    });
    expect(claims.assertEventExists).toHaveBeenCalledWith(eventId);
    expect(claims.assertActiveMember).toHaveBeenCalledWith(eventId, submitter);
    expect(receipts.createSignedUrl).toHaveBeenCalledWith(storagePath, 300);
  });
});

describe('createProcessClaimService', () => {
  it('rejects malformed processing identity before repository access', async () => {
    const claims = createRepository();
    const mandates = { read: vi.fn() };
    const processClaim = createProcessClaimService({
      claims,
      mandates,
      now: () => 1_788_156_000_000,
    });

    await expect(
      processClaim({ claimId: 'bad', processor: 'bad' }),
    ).rejects.toMatchObject({ code: 'invalid_request', status: 400 });
    expect(claims.getProcessContext).not.toHaveBeenCalled();
    expect(mandates.read).not.toHaveBeenCalled();
  });

  it('allows only the configured treasurer before reading Sui or saving', async () => {
    const claims = createRepository({
      getProcessContext: vi.fn(async () => processContext),
    });
    const mandates = { read: vi.fn() };
    const processClaim = createProcessClaimService({ claims, mandates });

    await expect(
      processClaim({ claimId: claim.id, processor: submitter }),
    ).rejects.toMatchObject({ code: 'processor_forbidden', status: 403 });
    expect(mandates.read).not.toHaveBeenCalled();
    expect(claims.saveDecision).not.toHaveBeenCalled();
  });

  it('returns a stored decision idempotently without reading Sui', async () => {
    const storedDecision: PolicyDecision = {
      outcome: 'review',
      checks: [],
      reason: 'Treasurer review required.',
      evaluatedAtMs: nowMs,
    };
    const storedClaim: Claim = {
      ...claim,
      state: 'awaiting_review',
      decision: storedDecision,
    };
    const claims = createRepository({
      getProcessContext: vi.fn(async () => ({
        ...processContext,
        claim: storedClaim,
      })),
    });
    const mandates = { read: vi.fn() };
    const processClaim = createProcessClaimService({ claims, mandates });

    await expect(
      processClaim({ claimId: claim.id, processor: treasurer }),
    ).resolves.toEqual({
      claim: storedClaim,
      decision: storedDecision,
      payment: null,
    });
    expect(mandates.read).not.toHaveBeenCalled();
    expect(claims.saveDecision).not.toHaveBeenCalled();
  });

  it('rejects an undecided claim outside the submitted state', async () => {
    const claims = createRepository({
      getProcessContext: vi.fn(async () => ({
        ...processContext,
        claim: { ...claim, state: 'approved' as const },
      })),
    });
    const mandates = { read: vi.fn() };
    const processClaim = createProcessClaimService({ claims, mandates });

    await expect(
      processClaim({ claimId: claim.id, processor: treasurer }),
    ).rejects.toMatchObject({ code: 'processing_conflict', status: 409 });
    expect(mandates.read).not.toHaveBeenCalled();
  });

  it.each([
    ['auto_pay', processContext, mandate, 'approved'],
    [
      'review',
      {
        ...processContext,
        event: { ...processContext.event, allowedCategories: ['food'] },
      },
      mandate,
      'awaiting_review',
    ],
    ['reject', processContext, { ...mandate, revoked: true }, 'rejected'],
  ] as const)(
    'maps %s policy outcome to %s state',
    async (expectedOutcome, context, mandateSnapshot, expectedState) => {
      const saveDecision = vi.fn(async (input) => ({
        status: 'saved' as const,
        claim: {
          ...claim,
          state: input.state,
          decision: input.decision,
        },
      }));
      const claims = createRepository({
        getProcessContext: vi.fn(async () => context),
        saveDecision,
      });
      const mandates = { read: vi.fn(async () => mandateSnapshot) };
      const processClaim = createProcessClaimService({
        claims,
        mandates,
        now: () => nowMs,
      });

      const response = await processClaim({
        claimId: claim.id,
        processor: treasurer,
      });

      expect(response.decision.outcome).toBe(expectedOutcome);
      expect(response.claim.state).toBe(expectedState);
      expect(response.payment).toBeNull();
      expect(saveDecision).toHaveBeenCalledWith({
        claimId: claim.id,
        decision: response.decision,
        state: expectedState,
      });
    },
  );

  it('returns the stored winner when another processor wins the save race', async () => {
    const winningDecision: PolicyDecision = {
      outcome: 'review',
      checks: [],
      reason: 'Stored winner',
      evaluatedAtMs: nowMs,
    };
    const winningClaim: Claim = {
      ...claim,
      state: 'awaiting_review',
      decision: winningDecision,
    };
    const claims = createRepository({
      getProcessContext: vi.fn(async () => processContext),
      saveDecision: vi.fn(async () => ({
        status: 'lost_race' as const,
        claim: winningClaim,
      })),
    });
    const processClaim = createProcessClaimService({
      claims,
      mandates: { read: vi.fn(async () => mandate) },
      now: () => nowMs,
    });

    await expect(
      processClaim({ claimId: claim.id, processor: treasurer }),
    ).resolves.toEqual({
      claim: winningClaim,
      decision: winningDecision,
      payment: null,
    });
  });

  it('sanitizes Sui failures and rejects a mismatched mandate object', async () => {
    const claims = createRepository({
      getProcessContext: vi.fn(async () => processContext),
    });
    const rawFailure = new Error('raw provider endpoint detail');
    const failing = createProcessClaimService({
      claims,
      mandates: { read: vi.fn(async () => Promise.reject(rawFailure)) },
    });

    const failure = failing({ claimId: claim.id, processor: treasurer });
    await expect(failure).rejects.toMatchObject({
      code: 'mandate_read_failed',
      status: 502,
    });
    await expect(failure).rejects.not.toThrow('raw provider endpoint detail');

    const mismatched = createProcessClaimService({
      claims,
      mandates: {
        read: vi.fn(async () => ({ ...mandate, id: `0x${'2'.repeat(64)}` })),
      },
    });
    await expect(
      mismatched({ claimId: claim.id, processor: treasurer }),
    ).rejects.toMatchObject({ code: 'mandate_read_failed', status: 502 });
  });
});
