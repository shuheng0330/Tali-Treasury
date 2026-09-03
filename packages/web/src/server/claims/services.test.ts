import type {
  Claim,
  MandateView,
  PaymentResult,
  PolicyDecision,
  ReceiptAnalysis,
} from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../errors';
import {
  PaymentConfigurationError,
  PaymentSubmissionUncertainError,
} from '../sui/payment-executor';
import type {
  AnalysisDraftRepository,
  ClaimRepository,
  PaymentExecutor,
  ReceiptStore,
} from './ports';
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
  review: null,
  paymentAttempt: null,
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
  claim: {
    ...claim,
    analysis: { ...analysis, currency: 'USDC' },
  },
  paymentAttemptBudgetBefore: null,
  event: {
    treasurer,
    mandateId,
    allowedCategories: ['printing'] as const,
    startsAtMs: Date.UTC(2026, 7, 29),
    expiresAtMs: Date.UTC(2026, 8, 5),
  },
};

const approvedDecision: PolicyDecision = {
  outcome: 'auto_pay',
  checks: [],
  reason: 'Every policy rule passed.',
  evaluatedAtMs: nowMs,
};
const approvedClaim: Claim = {
  ...processContext.claim,
  state: 'approved',
  decision: approvedDecision,
  review: null,
};
const payment: PaymentResult = {
  ok: true,
  digest: '7LhYxDemoDigest',
  checkpoint: '123',
  gasUsed: '1200',
  finalityMs: 900,
  abortCode: null,
  abortKey: null,
  message: 'Payment confirmed on Sui testnet.',
  rawError: null,
  budgetBefore: '80000000',
  budgetAfter: '75500000',
};

function createRequest() {
  return {
    draftId: '11111111-1111-4111-8111-111111111111',
    submitter,
    amount: '4500000',
    merchant: 'Campus Print Shop',
    receiptDate: '2026-08-30',
    category: 'printing',
    description: '',
  };
}

function createRepository(overrides: Partial<ClaimRepository> = {}): ClaimRepository {
  return {
    assertEventExists: vi.fn(async () => undefined),
    assertActiveMember: vi.fn(async () => undefined),
    assertEventViewer: vi.fn(async () => undefined),
    findDuplicateReceipt: vi.fn(async () => null),
    create: vi.fn(async () => claim),
    listByEvent: vi.fn(async () => []),
    resubmit: vi.fn(async () => ({ status: 'saved' as const, claim })),
    getProcessContext: vi.fn(),
    saveDecision: vi.fn(),
    applyReview: vi.fn(),
    reservePayment: vi.fn(),
    recordPaymentAttempt: vi.fn(),
    markPaymentAttemptChecked: vi.fn(),
    failApprovedPayment: vi.fn(),
    finishPayment: vi.fn(),
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

function createDraftRepository(
  overrides: Partial<AnalysisDraftRepository> = {},
): AnalysisDraftRepository {
  return {
    create: vi.fn(async (input) => ({
      id: '11111111-1111-4111-8111-111111111111',
      expiresAtMs: input.expiresAtMs,
    })),
    consumeToClaim: vi.fn(async () => claim),
    ...overrides,
  };
}

function createPaymentExecutor(
  overrides: Partial<PaymentExecutor> = {},
): PaymentExecutor {
  return {
    assertReady: vi.fn(),
    execute: vi.fn(async () => ({ status: 'paid' as const, payment })),
    reconcile: vi.fn(),
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
    const analyzeReceipt = createAnalyzeReceiptService({
      analyzer,
      claims,
      receipts,
      drafts: createDraftRepository(),
    });

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
    const analyzeReceipt = createAnalyzeReceiptService({
      analyzer,
      claims,
      receipts,
      drafts: createDraftRepository(),
    });

    await expect(
      analyzeReceipt({
        eventId,
        submitter,
        bytes: Buffer.from('hello'),
        mimeType: 'image/png',
      }),
    ).resolves.toEqual({
      analysis,
      draftId: null,
      draftExpiresAt: null,
      duplicateOf: claim.id,
    });
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
    const drafts = createDraftRepository({
      create: vi.fn(async (input) => {
        calls.push('draft');
        return {
          id: '11111111-1111-4111-8111-111111111111',
          expiresAtMs: input.expiresAtMs,
        };
      }),
    });
    const analyzeReceipt = createAnalyzeReceiptService({
      analyzer,
      claims,
      receipts,
      drafts,
      now: () => Date.parse('2026-09-01T12:00:00.000Z'),
    });

    await expect(
      analyzeReceipt({
        eventId,
        submitter,
        bytes: Buffer.from('hello'),
        mimeType: 'image/png',
      }),
    ).resolves.toEqual({
      analysis,
      draftId: '11111111-1111-4111-8111-111111111111',
      draftExpiresAt: '2026-09-01T12:15:00.000Z',
      duplicateOf: null,
    });
    expect(calls).toEqual([
      'event',
      'member',
      `duplicate:${receiptHash}`,
      'analyze',
      `upload:${eventId}`,
      'draft',
    ]);
    expect(drafts.create).toHaveBeenCalledWith({
      eventId,
      walletAddress: submitter,
      storagePath,
      receiptHash,
      analysis,
      createdAtMs: Date.parse('2026-09-01T12:00:00.000Z'),
      expiresAtMs: Date.parse('2026-09-01T12:15:00.000Z'),
    });
  });
});

describe('createClaimService', () => {
  it('rejects malformed input before repository access', async () => {
    const drafts = createDraftRepository();
    const createClaim = createClaimService({ drafts });

    await expect(
      createClaim({ ...createRequest(), amount: 'not-an-amount' }),
    ).rejects.toMatchObject({ code: 'invalid_request', status: 400 });
    expect(drafts.consumeToClaim).not.toHaveBeenCalled();
  });

  it('atomically consumes the stored draft with authenticated wallet and corrections', async () => {
    const drafts = createDraftRepository();
    const createClaim = createClaimService({
      drafts,
      now: () => Date.parse('2026-09-01T12:01:00.000Z'),
    });
    const corrected = {
      ...createRequest(),
      amount: '4750000',
      merchant: 'Campus Print & Copy',
      receiptDate: '2026-08-31',
      category: 'materials' as const,
    };

    await expect(createClaim(corrected)).resolves.toEqual({ claim });
    expect(drafts.consumeToClaim).toHaveBeenCalledWith({
      draftId: corrected.draftId,
      walletAddress: submitter,
      amount: '4750000',
      merchant: 'Campus Print & Copy',
      receiptDate: '2026-08-31',
      category: 'materials',
      description: '',
      nowMs: Date.parse('2026-09-01T12:01:00.000Z'),
    });
  });

  it('preserves safe draft and duplicate errors', async () => {
    const drafts = createDraftRepository({
      consumeToClaim: vi.fn(async () => {
        throw new ServerError('duplicate_receipt', 409, 'Receipt already claimed');
      }),
    });
    const createClaim = createClaimService({ drafts });

    await expect(createClaim(createRequest())).rejects.toMatchObject({
      code: 'duplicate_receipt',
      status: 409,
    });
  });
});

describe('createListClaimsService', () => {
  const listClaimsFor = (
    claims: ReturnType<typeof createRepository>,
    receipts: ReturnType<typeof createReceiptStore>,
  ) => createListClaimsService({ claims, receipts })({ eventId, viewer: submitter });

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
    expect(claims.assertEventViewer).toHaveBeenCalledWith(eventId, submitter);
    expect(receipts.createSignedUrl).toHaveBeenCalledWith(storagePath, 300);
  });

  it('still returns the claims whose receipts can be signed', async () => {
    const other = { ...claim, id: 'claim-missing-receipt' };
    const claims = createRepository({
      listByEvent: vi.fn(async () => [
        { claim, storagePath },
        { claim: other, storagePath: 'gone/from/storage.jpg' },
      ]),
    });
    const receipts = createReceiptStore();
    receipts.createSignedUrl = vi.fn(async (path: string) => {
      if (path === storagePath) return 'https://signed.example/receipt';
      throw new Error('Object not found');
    });

    await expect(listClaimsFor(claims, receipts)).resolves.toEqual({
      claims: [
        { ...claim, receiptUrl: 'https://signed.example/receipt' },
        { ...other, receiptUrl: null },
      ],
      cursor: null,
    });
  });
});

describe('createProcessClaimService', () => {
  it('rejects malformed processing identity before repository access', async () => {
    const claims = createRepository();
    const mandates = { read: vi.fn() };
    const processClaim = createProcessClaimService({
      claims,
      mandates,
      payments: createPaymentExecutor(),
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
    const processClaim = createProcessClaimService({
      claims,
      mandates,
      payments: createPaymentExecutor(),
    });

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
      review: null,
    };
    const claims = createRepository({
      getProcessContext: vi.fn(async () => ({
        ...processContext,
        claim: storedClaim,
      })),
    });
    const mandates = { read: vi.fn() };
    const processClaim = createProcessClaimService({
      claims,
      mandates,
      payments: createPaymentExecutor(),
    });

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
    const processClaim = createProcessClaimService({
      claims,
      mandates,
      payments: createPaymentExecutor(),
    });

    await expect(
      processClaim({ claimId: claim.id, processor: treasurer }),
    ).rejects.toMatchObject({ code: 'processing_conflict', status: 409 });
    expect(mandates.read).not.toHaveBeenCalled();
  });

  it('pays an auto-pay claim only after readiness, preflight and reservation', async () => {
    const calls: string[] = [];
    const paidClaim: Claim = { ...approvedClaim, state: 'paid', payment };
    const claims = createRepository({
      getProcessContext: vi.fn(async () => processContext),
      saveDecision: vi.fn(async () => ({
        status: 'saved' as const,
        claim: approvedClaim,
      })),
      reservePayment: vi.fn(async () => {
        calls.push('reserve');
        return {
          status: 'saved' as const,
          claim: { ...approvedClaim, state: 'paying' as const },
        };
      }),
      recordPaymentAttempt: vi.fn(async () => {
        calls.push('attempt');
        return {
          status: 'saved' as const,
          claim: { ...approvedClaim, state: 'paying' as const },
        };
      }),
      finishPayment: vi.fn(async () => ({
        status: 'saved' as const,
        claim: paidClaim,
      })),
    });
    const mandates = {
      read: vi.fn(async () => {
        calls.push('read');
        return mandate;
      }),
    };
    const payments = createPaymentExecutor({
      assertReady: vi.fn(() => {
        calls.push('ready');
      }),
      execute: vi.fn(async (_input, recordAttempt) => {
        await recordAttempt({ digest: '4'.repeat(44), preparedAtMs: nowMs });
        calls.push('execute');
        return { status: 'paid' as const, payment };
      }),
    });
    const processClaim = createProcessClaimService({
      claims,
      mandates,
      payments,
      now: () => nowMs,
    });

    await expect(
      processClaim({ claimId: claim.id, processor: treasurer }),
    ).resolves.toEqual({
      claim: paidClaim,
      decision: approvedDecision,
      payment,
    });
    expect(calls).toEqual(['read', 'ready', 'read', 'reserve', 'attempt', 'execute']);
    expect(payments.execute).toHaveBeenCalledWith(
      {
        claimId: claim.id,
        mandateId,
        recipient: submitter,
        amount: claim.amount,
        budgetBefore: mandate.remainingBudget,
      },
      expect.any(Function),
    );
    expect(claims.recordPaymentAttempt).toHaveBeenCalledWith({
      claimId: claim.id,
      digest: '4'.repeat(44),
      budgetBefore: mandate.remainingBudget,
      preparedAtMs: nowMs,
    });
    expect(claims.finishPayment).toHaveBeenCalledWith({
      claimId: claim.id,
      state: 'paid',
      payment,
    });
  });

  it('does not broadcast when another payment attempt wins persistence', async () => {
    let broadcast = false;
    const claims = createRepository({
      getProcessContext: vi.fn(async () => processContext),
      saveDecision: vi.fn(async () => ({
        status: 'saved' as const,
        claim: approvedClaim,
      })),
      reservePayment: vi.fn(async () => ({
        status: 'saved' as const,
        claim: { ...approvedClaim, state: 'paying' as const },
      })),
      recordPaymentAttempt: vi.fn(async () => ({
        status: 'lost_race' as const,
        claim: {
          ...approvedClaim,
          state: 'paying' as const,
          paymentAttempt: {
            digest: '5'.repeat(44),
            preparedAtMs: nowMs,
            lastCheckedAtMs: null,
          },
        },
      })),
    });
    const payments = createPaymentExecutor({
      execute: vi.fn(async (_input, recordAttempt) => {
        await recordAttempt({ digest: '4'.repeat(44), preparedAtMs: nowMs });
        broadcast = true;
        return { status: 'paid' as const, payment };
      }),
    });
    const service = createProcessClaimService({
      claims,
      mandates: { read: vi.fn(async () => mandate) },
      payments,
      now: () => nowMs,
    });

    await expect(
      service({ claimId: claim.id, processor: treasurer }),
    ).rejects.toMatchObject({ code: 'processing_conflict', status: 409 });
    expect(broadcast).toBe(false);
    expect(claims.finishPayment).not.toHaveBeenCalled();
  });

  it('returns a stored paid result without reading Sui or signing again', async () => {
    const paidClaim: Claim = { ...approvedClaim, state: 'paid', payment };
    const claims = createRepository({
      getProcessContext: vi.fn(async () => ({ ...processContext, claim: paidClaim })),
    });
    const mandates = { read: vi.fn() };
    const payments = createPaymentExecutor();
    const processClaim = createProcessClaimService({ claims, mandates, payments });

    await expect(
      processClaim({ claimId: claim.id, processor: treasurer }),
    ).resolves.toEqual({ claim: paidClaim, decision: approvedDecision, payment });
    expect(mandates.read).not.toHaveBeenCalled();
    expect(payments.assertReady).not.toHaveBeenCalled();
    expect(payments.execute).not.toHaveBeenCalled();
  });

  it.each(['paid', 'payment_failed'] as const)(
    'returns a human-approved %s payment even when the original decision was review',
    async (state) => {
      const reviewDecision: PolicyDecision = {
        ...approvedDecision,
        outcome: 'review',
        reason: 'Treasurer review required.',
      };
      const storedPayment = state === 'paid' ? payment : { ...payment, ok: false };
      const reviewedClaim: Claim = {
        ...approvedClaim,
        state,
        decision: reviewDecision,
        review: {
          action: 'approve',
          reviewer: treasurer,
          reason: null,
          reviewedAtMs: nowMs,
        },
        payment: storedPayment,
      };
      const claims = createRepository({
        getProcessContext: vi.fn(async () => ({
          ...processContext,
          claim: reviewedClaim,
        })),
      });
      const mandates = { read: vi.fn() };
      const payments = createPaymentExecutor();
      const processClaim = createProcessClaimService({ claims, mandates, payments });

      await expect(
        processClaim({ claimId: claim.id, processor: treasurer }),
      ).resolves.toEqual({
        claim: reviewedClaim,
        decision: reviewDecision,
        payment: storedPayment,
      });
      expect(mandates.read).not.toHaveBeenCalled();
      expect(payments.execute).not.toHaveBeenCalled();
    },
  );

  it('blocks retries while reconciliation is required', async () => {
    const claims = createRepository({
      getProcessContext: vi.fn(async () => ({
        ...processContext,
        claim: { ...approvedClaim, state: 'paying' as const },
      })),
    });
    const payments = createPaymentExecutor();
    const processClaim = createProcessClaimService({
      claims,
      mandates: { read: vi.fn() },
      payments,
    });

    await expect(
      processClaim({ claimId: claim.id, processor: treasurer }),
    ).rejects.toMatchObject({ code: 'processing_conflict', status: 409 });
    expect(payments.execute).not.toHaveBeenCalled();
  });

  it('leaves an approved claim untouched when payment configuration is missing', async () => {
    const claims = createRepository({
      getProcessContext: vi.fn(async () => ({
        ...processContext,
        claim: approvedClaim,
      })),
    });
    const payments = createPaymentExecutor({
      assertReady: vi.fn(() => {
        throw new PaymentConfigurationError();
      }),
    });
    const processClaim = createProcessClaimService({
      claims,
      mandates: { read: vi.fn() },
      payments,
    });

    await expect(
      processClaim({ claimId: claim.id, processor: treasurer }),
    ).rejects.toMatchObject({
      code: 'payment_configuration_failed',
      status: 503,
    });
    expect(claims.reservePayment).not.toHaveBeenCalled();
  });

  it('does not sign when another request wins payment reservation', async () => {
    const claims = createRepository({
      getProcessContext: vi.fn(async () => ({
        ...processContext,
        claim: approvedClaim,
      })),
      reservePayment: vi.fn(async () => ({
        status: 'lost_race' as const,
        claim: { ...approvedClaim, state: 'paying' as const },
      })),
    });
    const payments = createPaymentExecutor();
    const processClaim = createProcessClaimService({
      claims,
      mandates: { read: vi.fn(async () => mandate) },
      payments,
      now: () => nowMs,
    });

    await expect(
      processClaim({ claimId: claim.id, processor: treasurer }),
    ).rejects.toMatchObject({ code: 'processing_conflict', status: 409 });
    expect(payments.execute).not.toHaveBeenCalled();
  });

  it('leaves the claim paying when submission status is uncertain', async () => {
    const claims = createRepository({
      getProcessContext: vi.fn(async () => ({
        ...processContext,
        claim: approvedClaim,
      })),
      reservePayment: vi.fn(async () => ({
        status: 'saved' as const,
        claim: { ...approvedClaim, state: 'paying' as const },
      })),
    });
    const payments = createPaymentExecutor({
      execute: vi.fn(async () => {
        throw new PaymentSubmissionUncertainError();
      }),
    });
    const processClaim = createProcessClaimService({
      claims,
      mandates: { read: vi.fn(async () => mandate) },
      payments,
      now: () => nowMs,
    });

    await expect(
      processClaim({ claimId: claim.id, processor: treasurer }),
    ).rejects.toMatchObject({
      code: 'payment_submission_uncertain',
      status: 502,
    });
    expect(claims.finishPayment).not.toHaveBeenCalled();
  });

  it('records a sanitized failure when the live mandate changes before reservation', async () => {
    const policyFailure: PaymentResult = {
      ...payment,
      ok: false,
      digest: null,
      checkpoint: null,
      gasUsed: null,
      finalityMs: null,
      abortKey: 'POLICY_CHANGED',
      message: 'The live mandate no longer permits automatic payment.',
      budgetAfter: payment.budgetBefore,
    };
    const failedClaim: Claim = {
      ...approvedClaim,
      state: 'payment_failed',
      payment: policyFailure,
    };
    const claims = createRepository({
      getProcessContext: vi.fn(async () => ({
        ...processContext,
        claim: approvedClaim,
      })),
      failApprovedPayment: vi.fn(async () => ({
        status: 'saved' as const,
        claim: failedClaim,
      })),
    });
    const payments = createPaymentExecutor();
    const processClaim = createProcessClaimService({
      claims,
      mandates: { read: vi.fn(async () => ({ ...mandate, revoked: true })) },
      payments,
      now: () => nowMs,
    });

    await expect(
      processClaim({ claimId: claim.id, processor: treasurer }),
    ).resolves.toEqual({
      claim: failedClaim,
      decision: approvedDecision,
      payment: policyFailure,
    });
    expect(claims.failApprovedPayment).toHaveBeenCalledWith({
      claimId: claim.id,
      payment: policyFailure,
    });
    expect(claims.reservePayment).not.toHaveBeenCalled();
    expect(payments.execute).not.toHaveBeenCalled();
  });

  it.each([
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
          review: null,
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
        payments: createPaymentExecutor(),
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
      review: null,
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
      payments: createPaymentExecutor(),
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
      payments: createPaymentExecutor(),
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
      payments: createPaymentExecutor(),
    });
    await expect(
      mismatched({ claimId: claim.id, processor: treasurer }),
    ).rejects.toMatchObject({ code: 'mandate_read_failed', status: 502 });
  });

  it('sanitizes repository failures during loading and persistence', async () => {
    const loadFailure = createProcessClaimService({
      claims: createRepository({
        getProcessContext: vi.fn(async () => {
          throw new Error('raw Supabase load detail');
        }),
      }),
      mandates: { read: vi.fn() },
      payments: createPaymentExecutor(),
    });
    const loading = loadFailure({ claimId: claim.id, processor: treasurer });
    await expect(loading).rejects.toMatchObject({
      code: 'database_failed',
      status: 500,
    });
    await expect(loading).rejects.not.toThrow('raw Supabase load detail');

    const saveFailure = createProcessClaimService({
      claims: createRepository({
        getProcessContext: vi.fn(async () => processContext),
        saveDecision: vi.fn(async () => {
          throw new Error('raw Supabase update detail');
        }),
      }),
      mandates: { read: vi.fn(async () => mandate) },
      payments: createPaymentExecutor(),
      now: () => nowMs,
    });
    const saving = saveFailure({ claimId: claim.id, processor: treasurer });
    await expect(saving).rejects.toMatchObject({
      code: 'database_failed',
      status: 500,
    });
    await expect(saving).rejects.not.toThrow('raw Supabase update detail');
  });
});
