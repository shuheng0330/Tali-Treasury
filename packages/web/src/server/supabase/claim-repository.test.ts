import type {
  PaymentResult,
  PolicyDecision,
  ReceiptAnalysis,
} from '@tali/shared';
import { describe, expect, it } from 'vitest';

import { createSupabaseClaimRepository, mapClaimRow } from './claim-repository';
import type { LegacyCreateClaimRequest } from '../claims/ports';

const eventId = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
const submitter = `0x${'a'.repeat(64)}`;
const treasurer = `0x${'b'.repeat(64)}`;
const mandateId = `0x${'1'.repeat(64)}`;
const receiptHash = 'a'.repeat(64);
const transactionDigest = '4'.repeat(44);
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
const request: LegacyCreateClaimRequest = {
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
  review_action: null,
  reviewer_wallet: null,
  review_reason: null,
  reviewed_at: null,
  payment: null,
  payment_attempt_digest: null,
  payment_attempt_budget_before: null,
  payment_attempt_prepared_at: null,
  payment_attempt_last_checked_at: null,
  created_at: '2026-08-30T00:00:00.000Z',
  updated_at: '2026-08-30T00:00:01.000Z',
  event_members: { display_name: 'Lim Wey Cheng' },
};

const eventRow = {
  treasurer_wallet: treasurer,
  mandate_object_id: mandateId,
  allowed_categories: ['printing'],
  starts_at: '2026-08-29T00:00:00.000Z',
  expires_at: '2026-09-05T23:59:59.000Z',
};

/**
 * The process context is two reads, not an embed: the claim, then its event.
 * `claims.event_id` reaches an event only through the composite membership key,
 * so PostgREST cannot resolve `events!inner(...)`.
 */
const processRow = { ...row, events: eventRow };

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
  it('maps durable payment-attempt metadata without exposing signed bytes', () => {
    const attemptRow = {
      ...row,
      state: 'paying',
      payment_attempt_digest: transactionDigest,
      payment_attempt_budget_before: '20000000',
      payment_attempt_prepared_at: '2026-09-02T12:00:00.000Z',
      payment_attempt_last_checked_at: '2026-09-02T12:00:03.000Z',
    };

    expect(mapClaimRow(attemptRow).claim).toMatchObject({
      paymentAttempt: {
        digest: transactionDigest,
        preparedAtMs: Date.parse('2026-09-02T12:00:00.000Z'),
        lastCheckedAtMs: Date.parse('2026-09-02T12:00:03.000Z'),
      },
    });
    expect(mapClaimRow(attemptRow).claim.paymentAttempt).not.toHaveProperty('bytes');
    expect(mapClaimRow(attemptRow).claim.paymentAttempt).not.toHaveProperty('signature');
  });

  it('rejects incomplete payment-attempt metadata from the database', () => {
    expect(() =>
      mapClaimRow({
        ...row,
        state: 'paying',
        payment_attempt_digest: transactionDigest,
      }),
    ).toThrow('The database operation failed');
  });

  it('records a single payment digest before submission', async () => {
    let updated: unknown;
    const filters: Array<[string, string, unknown]> = [];
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingle: {
          data: {
            ...row,
            state: 'paying',
            payment_attempt_digest: transactionDigest,
            payment_attempt_budget_before: '20000000',
            payment_attempt_prepared_at: '2026-09-02T12:00:00.000Z',
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
      repository.recordPaymentAttempt({
        claimId: row.id,
        digest: transactionDigest,
        budgetBefore: '20000000',
        preparedAtMs: Date.parse('2026-09-02T12:00:00.000Z'),
      }),
    ).resolves.toEqual({
      status: 'saved',
      claim: expect.objectContaining({
        state: 'paying',
        paymentAttempt: expect.objectContaining({ digest: transactionDigest }),
      }),
    });
    expect(updated).toEqual({
      payment_attempt_digest: transactionDigest,
      payment_attempt_budget_before: '20000000',
      payment_attempt_prepared_at: '2026-09-02T12:00:00.000Z',
    });
    expect(filters).toContainEqual(['eq', 'state', 'paying']);
    expect(filters).toContainEqual(['is', 'payment', null]);
    expect(filters).toContainEqual(['is', 'payment_attempt_digest', null]);
  });

  it('timestamps a reconciliation check only for the matching paying attempt', async () => {
    let updated: unknown;
    const filters: Array<[string, string, unknown]> = [];
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingle: {
          data: {
            ...row,
            state: 'paying',
            payment_attempt_digest: transactionDigest,
            payment_attempt_budget_before: '20000000',
            payment_attempt_prepared_at: '2026-09-02T12:00:00.000Z',
            payment_attempt_last_checked_at: '2026-09-02T12:00:03.000Z',
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
      repository.markPaymentAttemptChecked({
        claimId: row.id,
        digest: transactionDigest,
        checkedAtMs: Date.parse('2026-09-02T12:00:03.000Z'),
      }),
    ).resolves.toEqual({
      status: 'saved',
      claim: expect.objectContaining({ state: 'paying' }),
    });
    expect(updated).toEqual({
      payment_attempt_last_checked_at: '2026-09-02T12:00:03.000Z',
    });
    expect(filters).toContainEqual(['eq', 'state', 'paying']);
    expect(filters).toContainEqual(['eq', 'payment_attempt_digest', transactionDigest]);
    expect(filters).toContainEqual(['is', 'payment', null]);
  });
  it.each([
    ['approve', 'approved'],
    ['reject', 'rejected'],
    ['request_correction', 'needs_correction'],
  ] as const)('atomically applies %s from awaiting_review to %s', async (action, state) => {
    let updated: unknown;
    const filters: Array<[string, string, unknown]> = [];
    const review = {
      action,
      reviewer: treasurer,
      reason: action === 'approve' ? null : 'Reviewed by treasurer',
      reviewedAtMs: Date.parse('2026-09-01T12:00:00.000Z'),
    };
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingle: {
          data: {
            ...row,
            state,
            review_action: action,
            reviewer_wallet: treasurer,
            review_reason: review.reason,
            reviewed_at: '2026-09-01T12:00:00.000Z',
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

    await expect(repository.applyReview({ claimId: row.id, review })).resolves.toEqual({
      status: 'saved',
      claim: expect.objectContaining({ state, review }),
    });
    expect(updated).toEqual({
      state,
      review_action: action,
      reviewer_wallet: treasurer,
      review_reason: review.reason,
      reviewed_at: '2026-09-01T12:00:00.000Z',
    });
    expect(filters).toContainEqual(['eq', 'state', 'awaiting_review']);
    expect(filters).toContainEqual(['is', 'review_action', null]);
  });

  it('reloads the review winner after a lost compare-and-set race', async () => {
    const winner = {
      action: 'reject' as const,
      reviewer: treasurer,
      reason: 'Duplicate expense',
      reviewedAtMs: Date.parse('2026-09-01T12:00:00.000Z'),
    };
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingles: [
          { data: null, error: null },
          {
            data: {
              ...processRow,
              state: 'rejected',
              review_action: winner.action,
              reviewer_wallet: winner.reviewer,
              review_reason: winner.reason,
              reviewed_at: '2026-09-01T12:00:00.000Z',
            },
            error: null,
          },
          { data: processRow.events, error: null },
        ],
      }),
    );

    await expect(
      repository.applyReview({
        claimId: row.id,
        review: { ...winner, action: 'approve', reason: null },
      }),
    ).resolves.toEqual({
      status: 'lost_race',
      claim: expect.objectContaining({ state: 'rejected', review: winner }),
    });
  });

  it('sanitizes database failures while applying a review', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingle: {
          data: null,
          error: { code: 'XX000', message: 'private database detail' },
        },
      }),
    );

    const result = repository.applyReview({
      claimId: row.id,
      review: {
        action: 'approve',
        reviewer: treasurer,
        reason: null,
        reviewedAtMs: Date.parse('2026-09-01T12:00:00.000Z'),
      },
    });
    await expect(result).rejects.toMatchObject({ code: 'database_failed', status: 500 });
    await expect(result).rejects.not.toThrow('private database detail');
  });

  it('loads a claim with its trusted event processing context', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingles: [
          { data: row, error: null },
          { data: eventRow, error: null },
        ],
      }),
    );

    await expect(repository.getProcessContext(row.id)).resolves.toEqual({
      claim: expect.objectContaining({ id: row.id, state: 'submitted' }),
      paymentAttemptBudgetBefore: null,
      event: {
        treasurer,
        mandateId,
        allowedCategories: ['printing'],
        startsAtMs: Date.parse('2026-08-29T00:00:00.000Z'),
        expiresAtMs: Date.parse('2026-09-05T23:59:59.000Z'),
      },
    });
  });

  it('rejects malformed internal payment-attempt budget metadata', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingles: [
          {
            data: {
              ...row,
              state: 'paying',
              payment_attempt_digest: transactionDigest,
              payment_attempt_budget_before: '-1',
              payment_attempt_prepared_at: '2026-09-02T12:00:00.000Z',
            },
            error: null,
          },
          { data: eventRow, error: null },
        ],
      }),
    );

    await expect(repository.getProcessContext(row.id)).rejects.toMatchObject({
      code: 'database_failed',
      status: 500,
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
            data: { ...row, state: 'paying', decision },
            error: null,
          },
          { data: eventRow, error: null },
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
            data: { ...row, state: 'paid', decision, payment },
            error: null,
          },
          { data: eventRow, error: null },
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
      ...row,
      state: 'awaiting_review',
      decision: { ...decision, outcome: 'review' },
    };
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingles: [
          { data: null, error: null },
          { data: winningRow, error: null },
          { data: eventRow, error: null },
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
        maybeSingles: [
          { data: row, error: null },
          { data: { ...eventRow, starts_at: 'not-a-date' }, error: null },
        ],
      }),
    );
    await expect(malformed.getProcessContext(row.id)).rejects.toMatchObject({
      code: 'database_failed',
      status: 500,
    });
  });

  it.each([
    ['treasurer address', { treasurer_wallet: '0x1234' }],
    ['mandate object id', { mandate_object_id: 'not-an-object-id' }],
  ])('rejects a malformed joined %s', async (_label, eventOverrides) => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingles: [
          { data: row, error: null },
          { data: { ...eventRow, ...eventOverrides }, error: null },
        ],
      }),
    );

    await expect(repository.getProcessContext(row.id)).rejects.toMatchObject({
      code: 'database_failed',
      status: 500,
    });
  });

  it('reports a conflict when a lost compare-and-set has no stored decision', async () => {
    const repository = createSupabaseClaimRepository(
      scriptedClient({
        maybeSingles: [
          { data: null, error: null },
          { data: row, error: null },
          { data: eventRow, error: null },
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
