import type {
  CreateClaimRequest,
  PaymentResult,
  PolicyDecision,
  ReceiptAnalysis,
} from '@tali/shared';
import { describe, expect, it } from 'vitest';

import { createSupabaseClaimRepository } from './claim-repository';

const eventId = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
const submitter = `0x${'a'.repeat(64)}`;
const treasurer = `0x${'b'.repeat(64)}`;
const mandateId = `0x${'1'.repeat(64)}`;
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

const processRow = {
  ...row,
  events: {
    treasurer_wallet: treasurer,
    mandate_object_id: mandateId,
    allowed_categories: ['printing'],
    starts_at: '2026-08-29T00:00:00.000Z',
    expires_at: '2026-09-05T23:59:59.000Z',
  },
};

const decision: PolicyDecision = {
  outcome: 'auto_pay',
  checks: [],
  reason: 'Every policy rule passed.',
  evaluatedAtMs: 1_788_156_000_000,
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
  budgetBefore: '20000000',
  budgetAfter: '15500000',
};
const failedPayment: PaymentResult = {
  ...payment,
  ok: false,
  digest: null,
  checkpoint: null,
  gasUsed: null,
  finalityMs: null,
  abortCode: 7,
  abortKey: 'RECIPIENT_NOT_APPROVED',
  message: 'This recipient is not approved by the mandate.',
  budgetAfter: payment.budgetBefore,
};

interface ScriptedResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

function scriptedClient(options: {
  maybeSingle?: ScriptedResult;
  maybeSingles?: ScriptedResult[];
  single?: ScriptedResult;
  list?: ScriptedResult;
  captureInsert?: (value: unknown) => void;
  captureUpdate?: (value: unknown) => void;
  captureFilter?: (kind: 'eq' | 'is', column: string, value: unknown) => void;
}) {
  const maybeSingles = [...(options.maybeSingles ?? [])];
  return {
    from: () => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          options.captureFilter?.('eq', column, value);
          return query;
        },
        is: (column: string, value: unknown) => {
          options.captureFilter?.('is', column, value);
          return query;
        },
        order: () => query,
        insert: (value: unknown) => {
          options.captureInsert?.(value);
          return query;
        },
        update: (value: unknown) => {
          options.captureUpdate?.(value);
          return query;
        },
        maybeSingle: async () =>
          maybeSingles.shift() ?? options.maybeSingle ?? { data: null, error: null },
        single: async () => options.single ?? { data: null, error: null },
        limit: async () => options.list ?? { data: [], error: null },
      };
      return query;
    },
  };
}

describe('createSupabaseClaimRepository', () => {
  it('loads a claim with its trusted event processing context', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingle: { data: processRow, error: null },
      }),
    );

    await expect(repository.getProcessContext(row.id)).resolves.toEqual({
      claim: expect.objectContaining({ id: row.id, state: 'submitted' }),
      event: {
        treasurer,
        mandateId,
        allowedCategories: ['printing'],
        startsAtMs: Date.parse('2026-08-29T00:00:00.000Z'),
        expiresAtMs: Date.parse('2026-09-05T23:59:59.000Z'),
      },
    });
  });

  it('atomically saves a decision only for an undecided submitted claim', async () => {
    let updated: unknown;
    const filters: Array<[string, string, unknown]> = [];
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingle: {
          data: { ...row, state: 'approved', decision },
          error: null,
        },
        captureUpdate: (value) => {
          updated = value;
        },
        captureFilter: (kind, column, value) => {
          filters.push([kind, column, value]);
        },
      }),
    );

    await expect(
      repository.saveDecision({ claimId: row.id, decision, state: 'approved' }),
    ).resolves.toEqual({
      status: 'saved',
      claim: expect.objectContaining({
        id: row.id,
        state: 'approved',
        decision,
      }),
    });
    expect(updated).toEqual({ decision, state: 'approved' });
    expect(filters).toContainEqual(['eq', 'id', row.id]);
    expect(filters).toContainEqual(['eq', 'state', 'submitted']);
    expect(filters).toContainEqual(['is', 'decision', null]);
  });

  it('reserves only an unpaid approved claim', async () => {
    let updated: unknown;
    const filters: Array<[string, string, unknown]> = [];
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingle: {
          data: { ...row, state: 'paying', decision },
          error: null,
        },
        captureUpdate: (value) => {
          updated = value;
        },
        captureFilter: (kind, column, value) => {
          filters.push([kind, column, value]);
        },
      }),
    );

    await expect(repository.reservePayment(row.id)).resolves.toEqual({
      status: 'saved',
      claim: expect.objectContaining({ state: 'paying', payment: null }),
    });
    expect(updated).toEqual({ state: 'paying' });
    expect(filters).toContainEqual(['eq', 'id', row.id]);
    expect(filters).toContainEqual(['eq', 'state', 'approved']);
    expect(filters).toContainEqual(['is', 'payment', null]);
  });

  it('records preflight failure only from an unpaid approved claim', async () => {
    let updated: unknown;
    const filters: Array<[string, string, unknown]> = [];
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingle: {
          data: {
            ...row,
            state: 'payment_failed',
            decision,
            payment: failedPayment,
          },
          error: null,
        },
        captureUpdate: (value) => {
          updated = value;
        },
        captureFilter: (kind, column, value) => {
          filters.push([kind, column, value]);
        },
      }),
    );

    await expect(
      repository.failApprovedPayment({ claimId: row.id, payment: failedPayment }),
    ).resolves.toEqual({
      status: 'saved',
      claim: expect.objectContaining({
        state: 'payment_failed',
        payment: failedPayment,
      }),
    });
    expect(updated).toEqual({ state: 'payment_failed', payment: failedPayment });
    expect(filters).toContainEqual(['eq', 'state', 'approved']);
    expect(filters).toContainEqual(['is', 'payment', null]);
  });

  it('finishes payment only from an unpaid paying claim', async () => {
    let updated: unknown;
    const filters: Array<[string, string, unknown]> = [];
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingle: {
          data: { ...row, state: 'paid', decision, payment },
          error: null,
        },
        captureUpdate: (value) => {
          updated = value;
        },
        captureFilter: (kind, column, value) => {
          filters.push([kind, column, value]);
        },
      }),
    );

    await expect(
      repository.finishPayment({ claimId: row.id, state: 'paid', payment }),
    ).resolves.toEqual({
      status: 'saved',
      claim: expect.objectContaining({ state: 'paid', payment }),
    });
    expect(updated).toEqual({ state: 'paid', payment });
    expect(filters).toContainEqual(['eq', 'state', 'paying']);
    expect(filters).toContainEqual(['is', 'payment', null]);
  });

  it('reloads the winner when another request reserves payment first', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingles: [
          { data: null, error: null },
          {
            data: { ...processRow, state: 'paying', decision },
            error: null,
          },
        ],
      }),
    );

    await expect(repository.reservePayment(row.id)).resolves.toEqual({
      status: 'lost_race',
      claim: expect.objectContaining({ state: 'paying' }),
    });
  });

  it('reloads the terminal winner when another request finishes first', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingles: [
          { data: null, error: null },
          {
            data: { ...processRow, state: 'paid', decision, payment },
            error: null,
          },
        ],
      }),
    );

    await expect(
      repository.finishPayment({ claimId: row.id, state: 'paid', payment }),
    ).resolves.toEqual({
      status: 'lost_race',
      claim: expect.objectContaining({ state: 'paid', payment }),
    });
  });

  it('returns a stored decision when another processor wins the race', async () => {
    const winningRow = {
      ...processRow,
      state: 'awaiting_review',
      decision: { ...decision, outcome: 'review' },
    };
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingles: [
          { data: null, error: null },
          { data: winningRow, error: null },
        ],
      }),
    );

    await expect(
      repository.saveDecision({ claimId: row.id, decision, state: 'approved' }),
    ).resolves.toEqual({
      status: 'lost_race',
      claim: expect.objectContaining({
        state: 'awaiting_review',
        decision: expect.objectContaining({ outcome: 'review' }),
      }),
    });
  });

  it('distinguishes a missing claim from malformed process context', async () => {
    const missing = createSupabaseClaimRepository(
      scriptedClient({ maybeSingle: { data: null, error: null } }),
    );
    await expect(missing.getProcessContext(row.id)).rejects.toMatchObject({
      code: 'claim_not_found',
      status: 404,
    });

    const malformed = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingle: {
          data: {
            ...processRow,
            events: { ...processRow.events, starts_at: 'not-a-date' },
          },
          error: null,
        },
      }),
    );
    await expect(malformed.getProcessContext(row.id)).rejects.toMatchObject({
      code: 'database_failed',
      status: 500,
    });
  });

  it('reports a conflict when a lost compare-and-set has no stored decision', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingles: [
          { data: null, error: null },
          { data: processRow, error: null },
        ],
      }),
    );

    await expect(
      repository.saveDecision({ claimId: row.id, decision, state: 'approved' }),
    ).rejects.toMatchObject({ code: 'processing_conflict', status: 409 });
  });

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

  it('maps the inactive-member trigger violation to member_not_found', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        single: {
          data: null,
          error: {
            code: '23514',
            message: 'claim submitter must be an active event member',
          },
        },
      }),
    );

    await expect(repository.create(request)).rejects.toMatchObject({
      code: 'member_not_found',
      status: 403,
    });
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

  it('distinguishes an unknown event from missing membership', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({ maybeSingle: { data: null, error: null } }),
    );

    await expect(repository.assertEventExists(eventId)).rejects.toMatchObject({
      code: 'event_not_found',
      status: 404,
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
