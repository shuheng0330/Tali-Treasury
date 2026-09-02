import type { ReconcileClaimResponse } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { pollPaymentReconciliation } from './reconciliation';

const digest = '4'.repeat(44);
const pending = {
  claim: { id: 'claim-id', state: 'paying' },
  status: 'pending' as const,
  digest,
  payment: null,
} as ReconcileClaimResponse;
const paid = {
  ...pending,
  claim: { id: 'claim-id', state: 'paid' },
  status: 'paid' as const,
  payment: { ok: true },
} as ReconcileClaimResponse;

describe('pollPaymentReconciliation', () => {
  it('stops immediately after a terminal result', async () => {
    const reconcile = vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(paid);
    const wait = vi.fn(async () => undefined);

    await expect(
      pollPaymentReconciliation(reconcile, { attempts: 10, intervalMs: 2000, wait }),
    ).resolves.toEqual(paid);
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(2000);
  });

  it('stops after the bounded 20-second window while still pending', async () => {
    const reconcile = vi.fn(async () => pending);
    const wait = vi.fn(async () => undefined);

    await expect(
      pollPaymentReconciliation(reconcile, { attempts: 10, intervalMs: 2000, wait }),
    ).resolves.toEqual(pending);
    expect(reconcile).toHaveBeenCalledTimes(10);
    expect(wait).toHaveBeenCalledTimes(9);
  });

  it('does not hide authorization or network failures', async () => {
    const failure = new Error('status unavailable');
    const reconcile = vi.fn(async () => {
      throw failure;
    });

    await expect(pollPaymentReconciliation(reconcile)).rejects.toBe(failure);
  });
});
