import type { CreateClaimRequest, ReceiptAnalysis } from '@tali/shared';
import { describe, expect, it } from 'vitest';

import { createSupabaseClaimRepository } from './claim-repository';

const eventId = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
const submitter = `0x${'a'.repeat(64)}`;
const receiptHash = 'a'.repeat(64);
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
const request: CreateClaimRequest = {
  eventId,
  submitter,
  amount: '4500000',
  merchant: 'Campus Print Shop',
  receiptDate: '2026-08-30',
  category: 'printing',
  description: '',
  storagePath,
  analysis,
};

const row = {
  id: '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7',
  event_id: eventId,
  submitter_wallet: submitter,
  receipt_object_path: storagePath,
  receipt_sha256: receiptHash,
  state: 'submitted',
  amount: '4500000',
  merchant: 'Campus Print Shop',
  receipt_date: '2026-08-30',
  category: 'printing',
  description: '',
  receipt_analysis: analysis,
  decision: null,
  payment: null,
  created_at: '2026-08-30T00:00:00.000Z',
  updated_at: '2026-08-30T00:00:01.000Z',
  event_members: { display_name: 'Lim Wey Cheng' },
};

interface ScriptedResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

function scriptedClient(options: {
  maybeSingle?: ScriptedResult;
  single?: ScriptedResult;
  list?: ScriptedResult;
  captureInsert?: (value: unknown) => void;
}) {
  return {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        insert: (value: unknown) => {
          options.captureInsert?.(value);
          return query;
        },
        maybeSingle: async () => options.maybeSingle ?? { data: null, error: null },
        single: async () => options.single ?? { data: null, error: null },
        limit: async () => options.list ?? { data: [], error: null },
      };
      return query;
    },
  };
}

describe('createSupabaseClaimRepository', () => {
  it('maps database rows to JSON-safe Claim values without exposing object paths', async () => {
    let inserted: unknown;
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        single: { data: row, error: null },
        captureInsert: (value) => {
          inserted = value;
        },
      }),
    );

    const result = await repository.create(request);

    expect(inserted).toMatchObject({
      event_id: eventId,
      submitter_wallet: submitter,
      receipt_object_path: storagePath,
      receipt_sha256: receiptHash,
      amount: '4500000',
      state: 'submitted',
    });
    expect(result).toMatchObject({
      eventId,
      submitter,
      submitterName: 'Lim Wey Cheng',
      amount: '4500000',
      receiptUrl: null,
      createdAtMs: Date.parse('2026-08-30T00:00:00.000Z'),
    });
    expect(result).not.toHaveProperty('receipt_object_path');
  });

  it('returns duplicate analysis and its internal path', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingle: {
          data: {
            id: row.id,
            receipt_analysis: analysis,
            receipt_object_path: storagePath,
          },
          error: null,
        },
      }),
    );

    await expect(repository.findDuplicateReceipt(eventId, receiptHash)).resolves.toEqual({
      claimId: row.id,
      analysis,
      storagePath,
    });
  });

  it('maps unique violations to duplicate_receipt', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        single: { data: null, error: { code: '23505', message: 'raw duplicate detail' } },
      }),
    );

    const result = repository.create(request);
    await expect(result).rejects.toMatchObject({ code: 'duplicate_receipt', status: 409 });
    await expect(result).rejects.not.toThrow('raw duplicate detail');
  });

  it('requires an active member and sanitizes missing membership', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({ maybeSingle: { data: null, error: null } }),
    );

    await expect(repository.assertActiveMember(eventId, submitter)).rejects.toMatchObject({
      code: 'member_not_found',
      status: 403,
    });
  });

  it('lists only the event query rows while retaining paths internally', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({ list: { data: [row], error: null } }),
    );

    await expect(repository.listByEvent(eventId)).resolves.toEqual([
      {
        claim: expect.objectContaining({ id: row.id, receiptUrl: null }),
        storagePath,
      },
    ]);
  });
});
