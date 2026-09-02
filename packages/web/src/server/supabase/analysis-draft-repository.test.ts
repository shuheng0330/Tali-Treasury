import { describe, expect, it, vi } from 'vitest';

import type { ReceiptAnalysis } from '@tali/shared';
import { createSupabaseAnalysisDraftRepository } from './analysis-draft-repository';

const eventId = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
const walletAddress = `0x${'a'.repeat(64)}`;
const draftId = '11111111-1111-4111-8111-111111111111';
const claimId = '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7';
const receiptHash = 'a'.repeat(64);
const analysis: ReceiptAnalysis = {
  merchant: 'Shop',
  amount: '1000000',
  currency: 'USDC',
  receiptDate: '2026-09-01',
  category: 'printing',
  confidence: 0.99,
  uncertainFields: [],
  warnings: [],
  receiptHash,
  fuzzyKey: 'shop|2026-09-01|1000000',
};

function chain(result: { data: unknown; error: unknown }) {
  const query = {
    insert: vi.fn(() => query),
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => result),
  };
  return query;
}

describe('Supabase analysis draft repository', () => {
  it('stores private receipt metadata and original extraction for fifteen minutes', async () => {
    const query = chain({
      data: { id: draftId, expires_at: '2026-09-01T12:15:00.000Z' },
      error: null,
    });
    const client = { from: vi.fn(() => query), rpc: vi.fn() };
    const drafts = createSupabaseAnalysisDraftRepository(client);

    await expect(
      drafts.create({
        eventId,
        walletAddress,
        storagePath: `${eventId}/${receiptHash}.png`,
        receiptHash,
        analysis,
        expiresAtMs: Date.parse('2026-09-01T12:15:00.000Z'),
        createdAtMs: Date.parse('2026-09-01T12:00:00.000Z'),
      }),
    ).resolves.toEqual({
      id: draftId,
      expiresAtMs: Date.parse('2026-09-01T12:15:00.000Z'),
    });
    expect(query.insert).toHaveBeenCalledWith({
      event_id: eventId,
      wallet_address: walletAddress,
      receipt_object_path: `${eventId}/${receiptHash}.png`,
      receipt_sha256: receiptHash,
      analysis,
      expires_at: '2026-09-01T12:15:00.000Z',
      created_at: '2026-09-01T12:00:00.000Z',
    });
  });

  it('uses the atomic consume RPC and preserves the stored original analysis', async () => {
    const claimRow = {
      id: claimId,
      event_id: eventId,
      submitter_wallet: walletAddress,
      receipt_object_path: `${eventId}/${receiptHash}.png`,
      receipt_sha256: receiptHash,
      state: 'submitted',
      amount: '1200000',
      merchant: 'Corrected Shop',
      receipt_date: '2026-09-01',
      category: 'printing',
      description: 'Confirmed',
      receipt_analysis: analysis,
      decision: null,
      review_action: null,
      reviewer_wallet: null,
      review_reason: null,
      reviewed_at: null,
      payment: null,
      created_at: '2026-09-01T12:00:00.000Z',
      updated_at: '2026-09-01T12:00:00.000Z',
      event_members: { display_name: 'Lim Wey Cheng' },
    };
    const claimQuery = chain({ data: claimRow, error: null });
    const rpc = vi.fn(async () => ({ data: [{ id: claimId }], error: null }));
    const drafts = createSupabaseAnalysisDraftRepository({
      from: vi.fn(() => claimQuery),
      rpc,
    });

    const claim = await drafts.consumeToClaim({
      draftId,
      walletAddress,
      amount: '1200000',
      merchant: 'Corrected Shop',
      receiptDate: '2026-09-01',
      category: 'printing',
      description: 'Confirmed',
      nowMs: Date.parse('2026-09-01T12:01:00.000Z'),
    });
    expect(claim.analysis).toEqual(analysis);
    expect(claim.amount).toBe('1200000');
    expect(rpc).toHaveBeenCalledWith('create_claim_from_analysis_draft', {
      p_draft_id: draftId,
      p_wallet_address: walletAddress,
      p_amount: '1200000',
      p_merchant: 'Corrected Shop',
      p_receipt_date: '2026-09-01',
      p_category: 'printing',
      p_description: 'Confirmed',
      p_now: '2026-09-01T12:01:00.000Z',
    });
  });

  it.each([
    ['PT403', 'analysis_draft_forbidden', 403],
    ['PT409', 'analysis_draft_consumed', 409],
    ['PT410', 'analysis_draft_expired', 410],
  ] as const)('maps %s to a safe draft error', async (code, expected, status) => {
    const drafts = createSupabaseAnalysisDraftRepository({
      from: vi.fn(),
      rpc: vi.fn(async () => ({ data: null, error: { code, message: 'private detail' } })),
    });
    const result = drafts.consumeToClaim({
      draftId,
      walletAddress,
      amount: '1200000',
      merchant: 'Shop',
      receiptDate: '2026-09-01',
      category: 'printing',
      description: '',
      nowMs: Date.parse('2026-09-01T12:01:00.000Z'),
    });
    await expect(result).rejects.toMatchObject({ code: expected, status });
    await expect(result).rejects.not.toThrow('private detail');
  });
});
