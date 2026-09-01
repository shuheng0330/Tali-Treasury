import { describe, expect, it, vi } from 'vitest';
import type { Claim, MandateView, PaymentResult, ReceiptAnalysis } from '@tali/shared';

import { createPayApprovedClaimService } from './pay';
import type { ClaimRepository, MandateReader, PaymentExecutor } from './ports';
import { PaymentSubmissionUncertainError } from '../sui/payment-executor';

const TREASURER = `0x${'b'.repeat(64)}`;
const MEMBER = `0x${'a'.repeat(64)}`;
const MANDATE_ID = `0x${'1'.repeat(64)}`;
const NOW = 1_788_159_600_000;

const analysis = { currency: 'USDC' } as ReceiptAnalysis;

const claim = {
  id: 'claim-1',
  submitter: MEMBER,
  state: 'approved',
  amount: '3000000',
  receiptDate: '2026-08-30',
  category: 'printing',
  analysis,
} as Claim;

const mandate = {
  id: MANDATE_ID,
  maxPerClaim: '5000000',
  remainingBudget: '17000000',
  approvedRecipients: [MEMBER],
  revoked: false,
  expiryMs: NOW + 86_400_000,
} as MandateView;

function payment(overrides: Partial<PaymentResult> = {}): PaymentResult {
  return {
    ok: true,
    digest: '0xdigest',
    checkpoint: '1',
    gasUsed: '900',
    finalityMs: 300,
    abortCode: null,
    abortKey: null,
    message: 'Payment confirmed on Sui testnet.',
    rawError: null,
    budgetBefore: '17000000',
    budgetAfter: '14000000',
    ...overrides,
  } as PaymentResult;
}

type MutationResult = Awaited<ReturnType<ClaimRepository['reservePayment']>>;
type FinishInput = Parameters<ClaimRepository['finishPayment']>[0];
type FailInput = Parameters<ClaimRepository['failApprovedPayment']>[0];

function service(options: {
  claim?: Partial<Claim>;
  mandate?: Partial<MandateView>;
  execute?: PaymentExecutor['execute'];
} = {}) {
  const current = { ...claim, ...options.claim } as Claim;
  const view = { ...mandate, ...options.mandate } as MandateView;

  const reservePayment = vi.fn(
    async (_claimId: string): Promise<MutationResult> => ({ status: 'saved', claim: current }),
  );
  const finishPayment = vi.fn(
    async (_input: FinishInput): Promise<MutationResult> => ({ status: 'saved', claim: current }),
  );
  const failApprovedPayment = vi.fn(
    async (_input: FailInput): Promise<MutationResult> => ({ status: 'saved', claim: current }),
  );

  const claims = {
    getProcessContext: vi.fn(async () => ({
      claim: current,
      event: {
        treasurer: TREASURER,
        mandateId: MANDATE_ID,
        allowedCategories: ['printing'],
        startsAtMs: NOW - 86_400_000,
        expiresAtMs: NOW + 86_400_000,
      },
    })),
    reservePayment,
    finishPayment,
    failApprovedPayment,
  } as unknown as ClaimRepository;

  const mandates: MandateReader = { read: vi.fn(async () => view) };
  const payments: PaymentExecutor = {
    assertReady: vi.fn(),
    execute: options.execute ?? vi.fn(async () => ({ status: 'paid' as const, payment: payment() })),
  };

  return {
    reservePayment,
    finishPayment,
    failApprovedPayment,
    payments,
    impl: createPayApprovedClaimService({ claims, mandates, payments, now: () => NOW }),
  };
}

const request = { claimId: 'claim-1', processor: TREASURER };

describe('createPayApprovedClaimService', () => {
  it('pays a claim a human approved, though the engine had sent it to review', async () => {
    // The engine's verdict is what the treasurer overrode. Demanding auto_pay
    // here would refuse the decision this endpoint exists to carry out.
    const { impl, finishPayment } = service();

    const result = await impl(request);

    expect(result.payment.ok).toBe(true);
    expect(finishPayment.mock.calls[0]![0].state).toBe('paid');
  });

  it('reserves the claim before it submits anything', async () => {
    // The reservation is what stops two treasurers paying the same claim at
    // once, so it has to happen first, not merely happen.
    const order: string[] = [];
    const { impl, reservePayment } = service({
      execute: vi.fn(async () => {
        order.push('execute');
        return { status: 'paid' as const, payment: payment() };
      }),
    });
    reservePayment.mockImplementation(async () => {
      order.push('reserve');
      return { status: 'saved', claim };
    });

    await impl(request);

    expect(order).toEqual(['reserve', 'execute']);
  });

  it('does not submit when the reservation was lost to another attempt', async () => {
    const { impl, reservePayment, payments } = service();
    reservePayment.mockImplementation(async () => ({ status: 'lost_race', claim }));

    await expect(impl(request)).rejects.toThrow('already being paid');
    expect(payments.execute).not.toHaveBeenCalled();
  });

  it('will not pay a claim in any state but approved', async () => {
    for (const state of ['awaiting_review', 'paid', 'paying', 'rejected'] as const) {
      const { impl, payments } = service({ claim: { state } });
      await expect(impl(request)).rejects.toThrow('nothing to pay');
      expect(payments.execute).not.toHaveBeenCalled();
    }
  });

  it('lets nobody but the treasurer release money', async () => {
    const { impl, payments } = service();
    await expect(impl({ ...request, processor: MEMBER })).rejects.toThrow(
      'Only the event treasurer',
    );
    expect(payments.execute).not.toHaveBeenCalled();
  });

  it('refuses without submitting when the contract would abort anyway', async () => {
    // A revoked mandate is an on-chain rule. Submitting would burn gas to be
    // told what the read already said.
    const { impl, payments, failApprovedPayment } = service({ mandate: { revoked: true } });

    const result = await impl(request);

    expect(payments.execute).not.toHaveBeenCalled();
    expect(result.payment.ok).toBe(false);
    expect(result.payment.abortKey).toBe('POLICY_CHANGED');
    expect(failApprovedPayment).toHaveBeenCalledOnce();
  });

  it('refuses when the amount now exceeds the per-claim cap', async () => {
    const { impl, payments } = service({ mandate: { maxPerClaim: '1000000' } });

    const result = await impl(request);

    expect(payments.execute).not.toHaveBeenCalled();
    expect(result.payment.ok).toBe(false);
  });

  it('leaves the claim in paying when the outcome is unknown', async () => {
    // A retry would pay the member twice, so this stops and asks for a human.
    const { impl, finishPayment } = service({
      execute: vi.fn(async () => {
        throw new PaymentSubmissionUncertainError();
      }),
    });

    await expect(impl(request)).rejects.toThrow('outcome is unknown');
    expect(finishPayment).not.toHaveBeenCalled();
  });

  it('records a contract refusal as payment_failed rather than throwing', async () => {
    const { impl, finishPayment } = service({
      execute: vi.fn(async () => ({
        status: 'rejected' as const,
        payment: payment({ ok: false, abortCode: 5, abortKey: 'AMOUNT_ABOVE_LIMIT' }),
      })),
    });

    const result = await impl(request);

    expect(result.payment.abortCode).toBe(5);
    expect(finishPayment.mock.calls[0]![0].state).toBe('payment_failed');
  });
});
