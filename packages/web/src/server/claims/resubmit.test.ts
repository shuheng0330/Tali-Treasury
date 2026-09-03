import { describe, expect, it, vi } from 'vitest';
import type { Claim } from '@tali/shared';

import { createResubmitClaimService } from './resubmit';
import type { ClaimRepository } from './ports';

const MEMBER = `0x${'a'.repeat(64)}`;
const STRANGER = `0x${'c'.repeat(64)}`;
const CLAIM_ID = 'claim-1';

type ResubmitInput = Parameters<ClaimRepository['resubmit']>[0];

const correction = {
  claimId: CLAIM_ID,
  submitter: MEMBER,
  merchant: 'Campus Print Shop',
  amount: '4500000',
  receiptDate: '2026-08-30',
  category: 'printing' as const,
  description: 'Poster printing',
};

function service(claimOverrides: Partial<Claim> = {}) {
  const claim = {
    id: CLAIM_ID,
    submitter: MEMBER,
    state: 'needs_correction',
    ...claimOverrides,
  } as Claim;

  const resubmit = vi.fn(async (_input: ResubmitInput) => ({
    status: 'saved' as const,
    claim,
  }));
  const claims = {
    getProcessContext: vi.fn(async () => ({ claim, event: {} })),
    resubmit,
  } as unknown as ClaimRepository;

  return { resubmit, impl: createResubmitClaimService({ claims }) };
}

describe('createResubmitClaimService', () => {
  it('puts a corrected claim back in the queue', async () => {
    const { impl, resubmit } = service();

    const result = await impl(correction);

    expect(result.accepted).toBe(true);
    expect(resubmit.mock.calls[0]![0].corrections).toEqual({
      merchant: 'Campus Print Shop',
      amount: '4500000',
      receiptDate: '2026-08-30',
      category: 'printing',
      description: 'Poster printing',
    });
  });

  it('lets nobody but the submitter correct a claim', async () => {
    const { impl, resubmit } = service();

    await expect(impl({ ...correction, submitter: STRANGER })).rejects.toThrow(
      'Only the member who submitted',
    );
    expect(resubmit).not.toHaveBeenCalled();
  });

  it('refuses a claim that was never sent back', async () => {
    for (const state of ['submitted', 'approved', 'paid', 'rejected'] as const) {
      const { impl, resubmit } = service({ state });
      await expect(impl(correction)).rejects.toThrow('nothing to correct');
      expect(resubmit).not.toHaveBeenCalled();
    }
  });

  it('never carries the receipt through a correction', async () => {
    // The hash is what makes a claim unique and what the duplicate check works
    // from, so a different photograph has to be a different claim.
    const { impl, resubmit } = service();

    await impl(correction);

    expect(Object.keys(resubmit.mock.calls[0]![0].corrections)).not.toContain('receiptHash');
    expect(Object.keys(resubmit.mock.calls[0]![0].corrections)).not.toContain('storagePath');
  });
});
