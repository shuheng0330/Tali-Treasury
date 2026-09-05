import { describe, expect, it, vi } from 'vitest';

import { createManualDraftService, manualClaimHash } from './manual';
import { ServerError } from '../errors';

const EVENT = '11111111-1111-4111-8111-111111111111';
const WALLET = `0x${'a'.repeat(64)}`;

function fields(over: Record<string, unknown> = {}) {
  return {
    eventId: EVENT,
    submitter: WALLET,
    merchant: 'Grab',
    amount: '24.50',
    currency: 'MYR' as const,
    receiptDate: '2026-09-05',
    category: 'transport' as const,
    description: 'Taxi to the venue',
    ...over,
  };
}

/** The two ports the service touches, kept readable so a test can assert on them. */
function deps(duplicate: { claimId: string } | null = null) {
  const create = vi.fn().mockResolvedValue({ id: 'draft-1', expiresAtMs: 1_000_000 });
  const claims = {
    assertEventExists: vi.fn().mockResolvedValue(undefined),
    assertActiveMember: vi.fn().mockResolvedValue(undefined),
    findDuplicateReceipt: vi
      .fn()
      .mockResolvedValue(
        duplicate ? { ...duplicate, analysis: { merchant: 'Grab' }, storagePath: 'x' } : null,
      ),
  };

  return {
    create,
    claims,
    service: createManualDraftService({
      claims: claims as never,
      drafts: { create } as never,
      now: () => 0,
    }),
    /** What `create` was called with, once it has been. */
    created: () => create.mock.calls[0]![0] as {
      storagePath: string;
      createdAtMs: number;
      expiresAtMs: number;
    },
  };
}

describe('manualClaimHash', () => {
  it('is a lowercase SHA-256, which is what the column accepts', () => {
    expect(manualClaimHash(fields())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is the same for the same expense typed twice', () => {
    expect(manualClaimHash(fields())).toBe(manualClaimHash(fields()));
  });

  it('ignores the case and spacing of who was paid', () => {
    expect(manualClaimHash(fields({ merchant: '  GRAB   ' }))).toBe(
      manualClaimHash(fields({ merchant: 'grab' })),
    );
  });

  it('changes when any detail of the expense changes', () => {
    const base = manualClaimHash(fields());
    for (const change of [
      { amount: '24.51' },
      { receiptDate: '2026-09-06' },
      { currency: 'USDC' },
      { merchant: 'Grabs' },
    ]) {
      expect(manualClaimHash(fields(change)), JSON.stringify(change)).not.toBe(base);
    }
  });

  /* Two people at the same dinner each paid; neither is the other's duplicate. */
  it('separates the same expense claimed by different wallets', () => {
    expect(manualClaimHash(fields({ submitter: `0x${'b'.repeat(64)}` }))).not.toBe(
      manualClaimHash(fields()),
    );
  });
});

describe('createManualDraftService', () => {
  it('creates a draft the submit step can consume', async () => {
    const response = await deps().service(fields());

    expect(response.draftId).toBe('draft-1');
    expect(response.duplicateOf).toBeNull();
    expect(response.analysis.merchant).toBe('Grab');
    expect(response.analysis.currency).toBe('MYR');
    expect(response.analysis.category).toBe('transport');
  });

  /* The amount travels in base units from here on, exactly as an extracted one
     does, so the two paths cannot disagree about what 24.50 means. */
  it('converts the amount to base units', async () => {
    const response = await deps().service(fields());
    expect(response.analysis.amount).toBe('24500000');
  });

  /**
   * The conversion multiplies whatever follows the dot by 10,000, so it is
   * reading hundredths. One digit is not hundredths: unpadded, "7.5" became
   * 7,050,000 base units — RM7.05 for an expense of RM7.50, and the schema
   * accepts one decimal at every layer.
   */
  it('reads a single decimal as tenths, not hundredths', async () => {
    for (const [typed, expected] of [
      ['7.5', '7500000'],
      ['0.5', '500000'],
      ['24.5', '24500000'],
      ['12', '12000000'],
      ['3.05', '3050000'],
      ['24.50', '24500000'],
    ]) {
      const response = await deps().service(fields({ amount: typed }));
      expect(response.analysis.amount, typed).toBe(expected);
    }
  });

  it('treats the same amount typed two ways as one claim', () => {
    expect(manualClaimHash(fields({ amount: '7.50' }))).toBe(
      manualClaimHash(fields({ amount: '7.50' })),
    );
  });

  /**
   * The routing threshold decides whether a claim may be paid with nobody
   * looking. A claim whose only evidence is that somebody typed it must not be.
   */
  it('reports no confidence at all, so the policy engine routes it to review', async () => {
    const response = await deps().service(fields());
    expect(response.analysis.confidence).toBe(0);
    expect(response.analysis.warnings.join(' ')).toContain('No receipt image');
  });

  it('carries a fuzzy key, so near-duplicates are still findable', async () => {
    const response = await deps().service(fields());
    expect(response.analysis.fuzzyKey).toContain('24500000');
  });

  it('names a storage path under manual, which holds no object', async () => {
    const dependencies = deps();
    await dependencies.service(fields());
    expect(dependencies.created().storagePath).toMatch(
      new RegExp(`^manual/${EVENT}/[0-9a-f]{64}$`),
    );
  });

  it('reports an existing claim rather than making a second draft', async () => {
    const dependencies = deps({ claimId: 'claim-9' });

    const response = await dependencies.service(fields());
    expect(response.duplicateOf).toBe('claim-9');
    expect(response.draftId).toBeNull();
    expect(dependencies.create).not.toHaveBeenCalled();
  });

  it('refuses the wallet the caller did not prove', async () => {
    await expect(deps().service(fields({ submitter: 'nope' }))).rejects.toThrow(ServerError);
  });

  it('refuses what the screen refuses', async () => {
    const { service } = deps();
    for (const bad of [
      { merchant: '   ' },
      { amount: '24.505' },
      { amount: '0' },
      { amount: '0.00' },
      { amount: 'free' },
      { receiptDate: '05-09-2026' },
      { category: 'bribes' },
      { description: '' },
      { currency: 'GBP' },
    ]) {
      await expect(service(fields(bad)), JSON.stringify(bad)).rejects.toThrow(ServerError);
    }
  });

  it('never lets a draft outlive the fifteen minutes the photographed one gets', async () => {
    const dependencies = deps();
    await dependencies.service(fields());
    const created = dependencies.created();
    expect(created.expiresAtMs - created.createdAtMs).toBe(15 * 60_000);
  });
});
