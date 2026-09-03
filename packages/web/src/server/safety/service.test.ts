import { describe, expect, it, vi } from 'vitest';
import type { MandateView, PaymentResult } from '@tali/shared';

import { createSafetyService } from './service';
import type { MandateReader, PaymentExecutor } from '../claims/ports';

const MANDATE_ID = '0xmandate';

const request = {
  attack: 'overspend' as const,
  amount: '15000000',
  recipient: '0xstranger',
};

function payment(overrides: Partial<PaymentResult> = {}): PaymentResult {
  return {
    ok: false,
    digest: '0xdigest',
    checkpoint: '1',
    gasUsed: '1000',
    finalityMs: 400,
    abortCode: 5,
    abortKey: 'AMOUNT_ABOVE_LIMIT',
    message: "This claim exceeds the mandate's per-claim limit.",
    rawError: null,
    budgetBefore: '17000000',
    budgetAfter: '17000000',
    ...overrides,
  } as PaymentResult;
}

function service(overrides: { executor?: Partial<PaymentExecutor> } = {}) {
  const executor: PaymentExecutor = {
    assertReady: vi.fn(),
    execute: vi.fn(async () => ({ status: 'rejected' as const, payment: payment() })),
    reconcile: vi.fn(),
    ...overrides.executor,
  };
  const mandates: MandateReader = {
    read: vi.fn(async () => ({ remainingBudget: '17000000' }) as MandateView),
  };
  return {
    executor,
    mandates,
    impl: createSafetyService({ executor, mandates, mandateId: MANDATE_ID }),
  };
}

describe('createSafetyService', () => {
  it('submits the payment without evaluating a single policy rule', async () => {
    // The whole claim is that the contract refuses. Checking the rules here
    // first would mean the app refused, which proves nothing.
    const { impl, executor } = service();

    const result = await impl.attack(request);

    expect(executor.execute).toHaveBeenCalledOnce();
    expect(vi.mocked(executor.execute).mock.calls[0]![0]).toMatchObject({
      mandateId: MANDATE_ID,
      recipient: '0xstranger',
      amount: '15000000',
    });
    expect(result.payment.abortCode).toBe(5);
    expect(result.digest).toBe('0xdigest');
  });

  it('reports a refusal as a result rather than throwing', async () => {
    const { impl } = service();
    await expect(impl.attack(request)).resolves.toMatchObject({
      payment: { ok: false },
    });
  });

  it('reports a payment the contract allowed, without pretending it refused', async () => {
    const { impl } = service({
      executor: {
        execute: vi.fn(async () => ({
          status: 'paid' as const,
          payment: payment({ ok: true, abortCode: null, abortKey: null }),
        })),
      },
    });

    await expect(impl.attack({ ...request, amount: '3000000' })).resolves.toMatchObject({
      payment: { ok: true },
    });
  });

  it('refuses the two attacks that need mandate state nobody will create', async () => {
    // Revoking or draining the demo mandate would break every other screen for
    // the rest of the session, so those stay predictions on the client.
    const { impl, executor } = service();

    for (const attack of ['after_revocation', 'drain_budget'] as const) {
      await expect(impl.attack({ ...request, attack })).rejects.toThrow('cannot be arranged');
    }
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('refuses to run at all when nothing can be signed', () => {
    const { impl } = service({
      executor: {
        assertReady: vi.fn(() => {
          throw new Error('no credentials');
        }),
      },
    });

    expect(() => impl.assertReady()).toThrow('no credentials');
  });
});
