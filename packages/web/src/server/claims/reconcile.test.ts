import { describe, expect, it, vi } from 'vitest';
import type { Claim, PaymentResult } from '@tali/shared';

import { createReconcileClaimService } from './reconcile';
import type { ClaimRepository } from './ports';

const TREASURER = `0x${'b'.repeat(64)}`;
const MEMBER = `0x${'a'.repeat(64)}`;
const CLAIM_ID = 'claim-1';
const DIGEST = '6Yq3kA1XbF9TzWmQpRsLdVnHgCxJeUoP2ZrN5tByMk8w';

type FinishInput = Parameters<ClaimRepository['finishPayment']>[0];

function service(claimOverrides: Partial<Claim> = {}) {
  const claim = {
    id: CLAIM_ID,
    state: 'paying',
    amount: '3000000',
    payment: null,
    ...claimOverrides,
  } as Claim;

  const finishPayment = vi.fn(async (_input: FinishInput) => ({
    status: 'saved' as const,
    claim,
  }));
  const claims = {
    getProcessContext: vi.fn(async () => ({
      claim,
      event: { treasurer: TREASURER },
    })),
    finishPayment,
  } as unknown as ClaimRepository;

  return { finishPayment, impl: createReconcileClaimService({ claims }) };
}

const request = { claimId: CLAIM_ID, processor: TREASURER } as const;

describe('createReconcileClaimService', () => {
  it('records a payment the treasurer found on the chain', async () => {
    const { impl, finishPayment } = service();

    const result = await impl({ ...request, outcome: 'paid', digest: DIGEST });

    expect(result.recorded).toBe(true);
    const saved = finishPayment.mock.calls[0]![0];
    expect(saved.state).toBe('paid');
    expect(saved.payment.digest).toBe(DIGEST);
    expect(saved.payment.ok).toBe(true);
  });

  it('will not take a treasurer at their word that a claim was paid', async () => {
    // Without a digest there is nothing anybody can check the claim against,
    // and "paid" would rest on one person's assertion.
    const { impl, finishPayment } = service();

    await expect(impl({ ...request, outcome: 'paid' })).rejects.toThrow('needs the digest');
    await expect(
      impl({ ...request, outcome: 'paid', digest: 'not a digest' }),
    ).rejects.toThrow('needs the digest');

    expect(finishPayment).not.toHaveBeenCalled();
  });

  it('sends a claim nothing paid back to where it can be released again', async () => {
    const { impl, finishPayment } = service();

    await impl({ ...request, outcome: 'not_paid' });

    const saved = finishPayment.mock.calls[0]![0];
    expect(saved.state).toBe('payment_failed');
    expect(saved.payment.ok).toBe(false);
    expect(saved.payment.digest).toBeNull();
  });

  it('only applies to a claim whose outcome is actually unknown', async () => {
    for (const state of ['approved', 'paid', 'rejected', 'awaiting_review'] as const) {
      const { impl, finishPayment } = service({ state });
      await expect(
        impl({ ...request, outcome: 'not_paid' }),
      ).rejects.toThrow('not in doubt');
      expect(finishPayment).not.toHaveBeenCalled();
    }
  });

  it('lets nobody but the treasurer resolve it', async () => {
    const { impl, finishPayment } = service();

    await expect(
      impl({ claimId: CLAIM_ID, processor: MEMBER, outcome: 'not_paid' }),
    ).rejects.toThrow('Only the event treasurer');
    expect(finishPayment).not.toHaveBeenCalled();
  });

  it('reports a claim something else settled first as not recorded', async () => {
    const claim = { id: CLAIM_ID, state: 'paid', payment: null } as Claim;
    const claims = {
      getProcessContext: vi.fn(async () => ({
        claim: { ...claim, state: 'paying' },
        event: { treasurer: TREASURER },
      })),
      finishPayment: vi.fn(async () => ({ status: 'lost_race' as const, claim })),
    } as unknown as ClaimRepository;

    const result = await createReconcileClaimService({ claims })({
      ...request,
      outcome: 'not_paid',
    });

    expect(result.recorded).toBe(false);
  });

  it('carries the budget the original attempt started from', async () => {
    const payment = { budgetBefore: '17000000' } as PaymentResult;
    const { impl, finishPayment } = service({ payment });

    await impl({ ...request, outcome: 'paid', digest: DIGEST });

    expect(finishPayment.mock.calls[0]![0].payment.budgetBefore).toBe('17000000');
  });
});
