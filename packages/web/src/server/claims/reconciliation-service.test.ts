import type { Claim, PaymentResult, PolicyDecision } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { createReconcileClaimService } from './services';
import type { ClaimRepository, PaymentExecutor } from './ports';
import { PaymentSubmissionUncertainError } from '../sui/payment-executor';

const claimId = '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7';
const submitter = `0x${'a'.repeat(64)}`;
const treasurer = `0x${'b'.repeat(64)}`;
const mandateId = `0x${'1'.repeat(64)}`;
const digest = '4'.repeat(44);
const preparedAtMs = Date.parse('2026-09-02T12:00:00.000Z');
const checkedAtMs = Date.parse('2026-09-02T12:00:03.000Z');

const decision: PolicyDecision = {
  outcome: 'auto_pay',
  checks: [],
  reason: 'Every rule passed.',
  evaluatedAtMs: preparedAtMs - 1000,
};

const payingClaim: Claim = {
  id: claimId,
  eventId: 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae',
  submitter,
  submitterName: 'Lim Wey Cheng',
  state: 'paying',
  amount: '1000000',
  merchant: 'Campus Print Shop',
  receiptDate: '2026-09-01',
  category: 'printing',
  description: '',
  receiptUrl: null,
  receiptHash: 'a'.repeat(64),
  analysis: null,
  decision,
  review: null,
  paymentAttempt: { digest, preparedAtMs, lastCheckedAtMs: null },
  payment: null,
  createdAtMs: preparedAtMs - 2000,
  updatedAtMs: preparedAtMs,
};

const payment: PaymentResult = {
  ok: true,
  digest,
  checkpoint: '123',
  gasUsed: '1200',
  finalityMs: 3000,
  abortCode: null,
  abortKey: null,
  message: 'Payment confirmed on Sui testnet.',
  rawError: null,
  budgetBefore: '20000000',
  budgetAfter: '19000000',
};

function context(claim = payingClaim) {
  return {
    claim,
    paymentAttemptBudgetBefore: claim.paymentAttempt ? '20000000' : null,
    event: {
      treasurer,
      mandateId,
      allowedCategories: ['printing' as const],
      startsAtMs: preparedAtMs - 100_000,
      expiresAtMs: preparedAtMs + 100_000,
    },
  };
}

function createClaims(overrides: Partial<ClaimRepository> = {}): ClaimRepository {
  return {
    getProcessContext: vi.fn(async () => context()),
    markPaymentAttemptChecked: vi.fn(async () => ({
      status: 'saved' as const,
      claim: {
        ...payingClaim,
        paymentAttempt: { ...payingClaim.paymentAttempt!, lastCheckedAtMs: checkedAtMs },
      },
    })),
    finishPayment: vi.fn(async ({ state, payment: result }) => ({
      status: 'saved' as const,
      claim: { ...payingClaim, state, payment: result },
    })),
    ...overrides,
  } as ClaimRepository;
}

function createPayments(overrides: Partial<PaymentExecutor> = {}): PaymentExecutor {
  return {
    assertReady: vi.fn(),
    execute: vi.fn(),
    reconcile: vi.fn(async () => ({ status: 'pending' as const, digest })),
    ...overrides,
  };
}

describe('createReconcileClaimService', () => {
  it('returns pending and timestamps the exact stored digest', async () => {
    const claims = createClaims();
    const payments = createPayments();
    const service = createReconcileClaimService({ claims, payments, now: () => checkedAtMs });

    await expect(service({ claimId, reconciler: treasurer })).resolves.toEqual({
      claim: expect.objectContaining({ state: 'paying' }),
      status: 'pending',
      digest,
      payment: null,
    });
    expect(payments.reconcile).toHaveBeenCalledWith({
      claimId,
      mandateId,
      recipient: submitter,
      amount: '1000000',
      budgetBefore: '20000000',
      digest,
      preparedAtMs,
    });
    expect(claims.markPaymentAttemptChecked).toHaveBeenCalledWith({
      claimId,
      digest,
      checkedAtMs,
    });
  });

  it('finishes a confirmed payment exactly once', async () => {
    const claims = createClaims();
    const payments = createPayments({
      reconcile: vi.fn(async () => ({ status: 'paid' as const, payment })),
    });
    const service = createReconcileClaimService({ claims, payments, now: () => checkedAtMs });

    await expect(service({ claimId, reconciler: treasurer })).resolves.toEqual({
      claim: expect.objectContaining({ state: 'paid', payment }),
      status: 'paid',
      digest,
      payment,
    });
    expect(claims.finishPayment).toHaveBeenCalledTimes(1);
  });

  it('returns a stored terminal result idempotently without querying Sui', async () => {
    const paid = { ...payingClaim, state: 'paid' as const, payment };
    const claims = createClaims({ getProcessContext: vi.fn(async () => context(paid)) });
    const payments = createPayments();
    const service = createReconcileClaimService({ claims, payments });

    await expect(service({ claimId, reconciler: treasurer })).resolves.toEqual({
      claim: paid,
      status: 'paid',
      digest,
      payment,
    });
    expect(payments.reconcile).not.toHaveBeenCalled();
  });

  it('rejects a non-treasurer without querying Sui', async () => {
    const payments = createPayments();
    const service = createReconcileClaimService({ claims: createClaims(), payments });

    await expect(service({ claimId, reconciler: submitter })).rejects.toMatchObject({
      code: 'reviewer_forbidden',
      status: 403,
    });
    expect(payments.reconcile).not.toHaveBeenCalled();
  });

  it('fails closed for a legacy paying claim with no digest', async () => {
    const legacy = { ...payingClaim, paymentAttempt: null };
    const payments = createPayments();
    const service = createReconcileClaimService({
      claims: createClaims({ getProcessContext: vi.fn(async () => context(legacy)) }),
      payments,
    });

    await expect(service({ claimId, reconciler: treasurer })).rejects.toMatchObject({
      code: 'payment_reconciliation_unavailable',
      status: 409,
    });
    expect(payments.reconcile).not.toHaveBeenCalled();
  });

  it('sanitizes RPC uncertainty and preserves paying', async () => {
    const payments = createPayments({
      reconcile: vi.fn(async () => {
        throw new PaymentSubmissionUncertainError(digest, {
          cause: new Error('private RPC host'),
        });
      }),
    });
    const service = createReconcileClaimService({ claims: createClaims(), payments });

    const result = service({ claimId, reconciler: treasurer });
    await expect(result).rejects.toMatchObject({
      code: 'payment_reconciliation_failed',
      status: 502,
    });
    await expect(result).rejects.not.toThrow('private RPC host');
  });
});
