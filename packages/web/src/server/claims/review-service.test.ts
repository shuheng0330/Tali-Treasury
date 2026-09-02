import type {
  Claim,
  ClaimReview,
  MandateView,
  PaymentResult,
  PolicyDecision,
} from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import type { ClaimRepository, PaymentExecutor } from './ports';
import { createReviewClaimService } from './services';
import {
  PaymentConfigurationError,
  PaymentSubmissionUncertainError,
} from '../sui/payment-executor';

const claimId = '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7';
const eventId = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
const submitter = `0x${'a'.repeat(64)}`;
const treasurer = `0x${'b'.repeat(64)}`;
const mandateId = `0x${'1'.repeat(64)}`;
const nowMs = Date.UTC(2026, 8, 1, 4);

const storedDecision: PolicyDecision = {
  outcome: 'review',
  checks: [],
  reason: 'Treasurer review required.',
  evaluatedAtMs: nowMs - 1000,
};

const claim: Claim = {
  id: claimId,
  eventId,
  submitter,
  submitterName: 'Lim Wey Cheng',
  state: 'awaiting_review',
  amount: '1000000',
  merchant: 'Campus Print Shop',
  receiptDate: '2026-08-31',
  category: 'printing',
  description: '',
  receiptUrl: null,
  receiptHash: 'a'.repeat(64),
  analysis: {
    merchant: 'Campus Print Shop',
    amount: '1000000',
    currency: 'USDC',
    receiptDate: '2026-08-31',
    category: 'printing',
    confidence: 0.8,
    uncertainFields: [],
    warnings: [],
    receiptHash: 'a'.repeat(64),
    fuzzyKey: 'campus print shop|2026-08-31|1000000',
  },
  decision: storedDecision,
  review: null,
  paymentAttempt: null,
  payment: null,
  createdAtMs: nowMs - 2000,
  updatedAtMs: nowMs - 1000,
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

const context = {
  claim,
  paymentAttemptBudgetBefore: null,
  event: {
    treasurer,
    mandateId,
    allowedCategories: ['printing'] as const,
    startsAtMs: Date.UTC(2026, 7, 29),
    expiresAtMs: Date.UTC(2026, 8, 5),
  },
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
  budgetAfter: '79000000',
};

function repository(overrides: Partial<ClaimRepository> = {}): ClaimRepository {
  return {
    assertEventExists: vi.fn(),
    assertActiveMember: vi.fn(),
    assertEventViewer: vi.fn(),
    findDuplicateReceipt: vi.fn(),
    create: vi.fn(),
    listByEvent: vi.fn(),
    getProcessContext: vi.fn(async () => context),
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

function executor(overrides: Partial<PaymentExecutor> = {}): PaymentExecutor {
  return {
    assertReady: vi.fn(),
    execute: vi.fn(async () => ({ status: 'paid' as const, payment })),
    reconcile: vi.fn(),
    ...overrides,
  };
}

function review(action: ClaimReview['action'], reason: string | null): ClaimReview {
  return { action, reviewer: treasurer, reason, reviewedAtMs: nowMs };
}

describe('createReviewClaimService', () => {
  it('allows only the configured treasurer', async () => {
    const claims = repository();
    const payments = executor();
    const service = createReviewClaimService({
      claims,
      mandates: { read: vi.fn() },
      payments,
      now: () => nowMs,
    });

    await expect(
      service({ claimId, action: 'reject', reviewer: submitter, reason: 'No' }),
    ).rejects.toMatchObject({ code: 'reviewer_forbidden', status: 403 });
    expect(claims.applyReview).not.toHaveBeenCalled();
    expect(payments.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['reject', 'rejected'],
    ['request_correction', 'needs_correction'],
  ] as const)('persists %s without payment', async (action, state) => {
    const expectedReview = review(action, 'Treasurer reason');
    const reviewedClaim = { ...claim, state, review: expectedReview } as Claim;
    const claims = repository({
      applyReview: vi.fn(async () => ({ status: 'saved' as const, claim: reviewedClaim })),
    });
    const payments = executor();
    const service = createReviewClaimService({
      claims,
      mandates: { read: vi.fn() },
      payments,
      now: () => nowMs,
    });

    await expect(
      service({ claimId, action, reviewer: treasurer, reason: 'Treasurer reason' }),
    ).resolves.toEqual({ claim: reviewedClaim, payment: null });
    expect(claims.applyReview).toHaveBeenCalledWith({ claimId, review: expectedReview });
    expect(payments.execute).not.toHaveBeenCalled();
  });

  it('pays an eligible USDC approval only after winning the review transition', async () => {
    const expectedReview = review('approve', null);
    const paying = { ...claim, state: 'paying' as const, review: expectedReview };
    const paymentAttempt = {
      digest: '4'.repeat(44),
      preparedAtMs: nowMs,
      lastCheckedAtMs: null,
    };
    const paid = { ...paying, state: 'paid' as const, paymentAttempt, payment };
    const claims = repository({
      applyReview: vi.fn(async () => ({ status: 'saved' as const, claim: paying })),
      recordPaymentAttempt: vi.fn(async () => ({
        status: 'saved' as const,
        claim: { ...paying, paymentAttempt },
      })),
      finishPayment: vi.fn(async () => ({ status: 'saved' as const, claim: paid })),
    });
    const payments = executor({
      execute: vi.fn(async (_input, recordAttempt) => {
        await recordAttempt({ digest: paymentAttempt.digest, preparedAtMs: nowMs });
        return { status: 'paid' as const, payment };
      }),
    });
    const service = createReviewClaimService({
      claims,
      mandates: { read: vi.fn(async () => mandate) },
      payments,
      now: () => nowMs,
    });

    await expect(
      service({ claimId, action: 'approve', reviewer: treasurer }),
    ).resolves.toEqual({ claim: paid, payment });
    expect(claims.applyReview).toHaveBeenCalledWith({ claimId, review: expectedReview });
    expect(claims.recordPaymentAttempt).toHaveBeenCalledWith({
      claimId,
      digest: paymentAttempt.digest,
      budgetBefore: mandate.remainingBudget,
      preparedAtMs: nowMs,
    });
    expect(payments.execute).toHaveBeenCalledTimes(1);
  });

  it('blocks approval for non-USDC claims without changing state', async () => {
    const claims = repository({
      getProcessContext: vi.fn(async () => ({
        ...context,
        claim: { ...claim, analysis: { ...claim.analysis!, currency: 'MYR' } },
      })),
    });
    const service = createReviewClaimService({
      claims,
      mandates: { read: vi.fn() },
      payments: executor(),
      now: () => nowMs,
    });

    await expect(
      service({ claimId, action: 'approve', reviewer: treasurer }),
    ).rejects.toMatchObject({ code: 'processing_conflict', status: 409 });
    expect(claims.applyReview).not.toHaveBeenCalled();
  });

  it('blocks approval when a fresh on-chain check fails', async () => {
    const claims = repository();
    const service = createReviewClaimService({
      claims,
      mandates: { read: vi.fn(async () => ({ ...mandate, revoked: true })) },
      payments: executor(),
      now: () => nowMs,
    });

    await expect(
      service({ claimId, action: 'approve', reviewer: treasurer }),
    ).rejects.toMatchObject({ code: 'processing_conflict', status: 409 });
    expect(claims.applyReview).not.toHaveBeenCalled();
  });

  it('leaves awaiting_review untouched when the signer is unavailable', async () => {
    const claims = repository();
    const payments = executor({
      assertReady: vi.fn(() => {
        throw new PaymentConfigurationError();
      }),
    });
    const service = createReviewClaimService({
      claims,
      mandates: { read: vi.fn() },
      payments,
      now: () => nowMs,
    });

    await expect(
      service({ claimId, action: 'approve', reviewer: treasurer }),
    ).rejects.toMatchObject({ code: 'payment_configuration_failed', status: 503 });
    expect(claims.applyReview).not.toHaveBeenCalled();
  });

  it('does not sign when another approval wins the compare-and-set', async () => {
    const winnerReview = review('approve', null);
    const claims = repository({
      applyReview: vi.fn(async () => ({
        status: 'lost_race' as const,
        claim: { ...claim, state: 'paying' as const, review: winnerReview },
      })),
    });
    const payments = executor();
    const service = createReviewClaimService({
      claims,
      mandates: { read: vi.fn(async () => mandate) },
      payments,
      now: () => nowMs,
    });

    await expect(
      service({ claimId, action: 'approve', reviewer: treasurer }),
    ).rejects.toMatchObject({ code: 'payment_submission_uncertain', status: 502 });
    expect(payments.execute).not.toHaveBeenCalled();
  });

  it('stores a confirmed payment rejection as payment_failed', async () => {
    const expectedReview = review('approve', null);
    const paying = { ...claim, state: 'paying' as const, review: expectedReview };
    const rejectedPayment = { ...payment, ok: false, digest: null, abortKey: 'FAILED' };
    const failed = { ...paying, state: 'payment_failed' as const, payment: rejectedPayment };
    const claims = repository({
      applyReview: vi.fn(async () => ({ status: 'saved' as const, claim: paying })),
      finishPayment: vi.fn(async () => ({ status: 'saved' as const, claim: failed })),
    });
    const service = createReviewClaimService({
      claims,
      mandates: { read: vi.fn(async () => mandate) },
      payments: executor({
        execute: vi.fn(async () => ({ status: 'rejected' as const, payment: rejectedPayment })),
      }),
      now: () => nowMs,
    });

    await expect(
      service({ claimId, action: 'approve', reviewer: treasurer }),
    ).resolves.toEqual({ claim: failed, payment: rejectedPayment });
  });

  it('leaves an uncertain submission in paying', async () => {
    const expectedReview = review('approve', null);
    const paying = { ...claim, state: 'paying' as const, review: expectedReview };
    const claims = repository({
      applyReview: vi.fn(async () => ({ status: 'saved' as const, claim: paying })),
    });
    const service = createReviewClaimService({
      claims,
      mandates: { read: vi.fn(async () => mandate) },
      payments: executor({
        execute: vi.fn(async () => {
          throw new PaymentSubmissionUncertainError();
        }),
      }),
      now: () => nowMs,
    });

    await expect(
      service({ claimId, action: 'approve', reviewer: treasurer }),
    ).rejects.toMatchObject({ code: 'payment_submission_uncertain', status: 502 });
    expect(claims.finishPayment).not.toHaveBeenCalled();
  });

  it('returns exact rejection replays and conflicts on a different action', async () => {
    const storedReview = review('reject', 'Duplicate expense');
    const reviewedClaim = { ...claim, state: 'rejected' as const, review: storedReview };
    const claims = repository({
      getProcessContext: vi.fn(async () => ({ ...context, claim: reviewedClaim })),
    });
    const service = createReviewClaimService({
      claims,
      mandates: { read: vi.fn() },
      payments: executor(),
      now: () => nowMs,
    });

    await expect(
      service({
        claimId,
        action: 'reject',
        reviewer: treasurer,
        reason: 'Duplicate expense',
      }),
    ).resolves.toEqual({ claim: reviewedClaim, payment: null });
    await expect(
      service({ claimId, action: 'approve', reviewer: treasurer }),
    ).rejects.toMatchObject({ code: 'processing_conflict', status: 409 });
    expect(claims.applyReview).not.toHaveBeenCalled();
  });
});
