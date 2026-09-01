import { EXPENSE_CATEGORIES } from '@tali/shared';
import type {
  Claim,
  ClaimReview,
  ClaimState,
  CreateClaimRequest,
  ExpenseCategory,
  PaymentResult,
  PolicyDecision,
  ReceiptAnalysis,
} from '@tali/shared';

import type {
  ClaimRepository,
  DuplicateReceipt,
  PaymentMutationResult,
  StoredClaim,
} from '../claims/ports';
import { ServerError } from '../errors';

interface DatabaseError {
  code?: string;
  message?: string;
}

interface QueryResult {
  data: unknown;
  error: DatabaseError | null;
}

interface QueryBuilder {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  is(column: string, value: unknown): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  insert(value: unknown): QueryBuilder;
  update(value: unknown): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
  limit(count: number): Promise<QueryResult>;
}

interface SupabaseDataClient {
  from(table: string): unknown;
}

interface ClaimRow {
  id: string;
  event_id: string;
  submitter_wallet: string;
  receipt_object_path: string;
  receipt_sha256: string;
  state: ClaimState;
  amount: string | number;
  merchant: string;
  receipt_date: string;
  category: ExpenseCategory;
  description: string;
  receipt_analysis: ReceiptAnalysis;
  decision: PolicyDecision | null;
  review: ClaimReview | null;
  payment: PaymentResult | null;
  created_at: string;
  updated_at: string;
  event_members: { display_name: string } | { display_name: string }[];
}

interface EventProcessRow {
  treasurer_wallet: string;
  mandate_object_id: string;
  allowed_categories: ExpenseCategory[];
  starts_at: string;
  expires_at: string;
}

interface ClaimProcessRow extends ClaimRow {
  events: EventProcessRow | EventProcessRow[];
}

const CLAIM_COLUMNS_BASE = `
  id,
  event_id,
  submitter_wallet,
  receipt_object_path,
  receipt_sha256,
  state,
  amount,
  merchant,
  receipt_date,
  category,
  description,
  receipt_analysis,
  decision,
  payment,
  created_at,
  updated_at,
  event_members!claims_active_member_fk(display_name)
`;

/**
 * `claims.review` arrives in a migration this app cannot apply itself, so every
 * read has to work on a database that does not have it yet. The column is asked
 * for once; PostgREST answers 42703 if it is absent, and it is dropped from the
 * projection from then on.
 */
let reviewColumn: 'unknown' | 'present' | 'absent' = 'unknown';

const UNDEFINED_COLUMN = '42703';

function claimColumns(): string {
  return reviewColumn === 'absent' ? CLAIM_COLUMNS_BASE : `${CLAIM_COLUMNS_BASE}, review`;
}

const EVENT_POLICY_COLUMNS =
  'treasurer_wallet, mandate_object_id, allowed_categories, starts_at, expires_at';

const CANONICAL_SUI_ID = /^0x[0-9a-f]{64}$/;

function databaseFailure(error: DatabaseError | null): ServerError {
  return new ServerError('database_failed', 500, 'The database operation failed', {
    cause: error ?? undefined,
  });
}

function mapClaimRow(input: unknown): StoredClaim {
  if (!input || typeof input !== 'object') {
    throw databaseFailure(null);
  }
  const row = input as ClaimRow;
  const membership = Array.isArray(row.event_members)
    ? row.event_members[0]
    : row.event_members;
  const createdAtMs = Date.parse(row.created_at);
  const updatedAtMs = Date.parse(row.updated_at);
  if (!membership?.display_name || !Number.isFinite(createdAtMs) || !Number.isFinite(updatedAtMs)) {
    throw databaseFailure(null);
  }

  const claim: Claim = {
    id: row.id,
    eventId: row.event_id,
    submitter: row.submitter_wallet,
    submitterName: membership.display_name,
    state: row.state,
    amount: String(row.amount),
    merchant: row.merchant,
    receiptDate: row.receipt_date,
    category: row.category,
    description: row.description,
    receiptUrl: null,
    receiptHash: row.receipt_sha256,
    analysis: row.receipt_analysis,
    decision: row.decision,
    review: row.review ?? null,
    payment: row.payment,
    createdAtMs,
    updatedAtMs,
  };

  return { claim, storagePath: row.receipt_object_path };
}

function mapProcessRow(input: unknown) {
  const stored = mapClaimRow(input);
  const row = input as ClaimProcessRow;
  const event = Array.isArray(row.events) ? row.events[0] : row.events;
  const startsAtMs = Date.parse(event?.starts_at ?? '');
  const expiresAtMs = Date.parse(event?.expires_at ?? '');
  if (
    !event?.treasurer_wallet ||
    !CANONICAL_SUI_ID.test(event.treasurer_wallet) ||
    !event.mandate_object_id ||
    !CANONICAL_SUI_ID.test(event.mandate_object_id) ||
    !Array.isArray(event.allowed_categories) ||
    !event.allowed_categories.every((category) =>
      EXPENSE_CATEGORIES.includes(category),
    ) ||
    !Number.isFinite(startsAtMs) ||
    !Number.isFinite(expiresAtMs)
  ) {
    throw databaseFailure(null);
  }

  return {
    claim: stored.claim,
    event: {
      treasurer: event.treasurer_wallet,
      mandateId: event.mandate_object_id,
      allowedCategories: event.allowed_categories,
      startsAtMs,
      expiresAtMs,
    },
  };
}

function query(client: SupabaseDataClient, table: string): QueryBuilder {
  return client.from(table) as QueryBuilder;
}

export function createSupabaseClaimRepository(
  client: SupabaseDataClient,
): ClaimRepository {
  let probe: Promise<void> | undefined;

  /* Asked once per process, not per query, so a database without the column
     costs one extra round trip in total rather than a failed read each time. */
  async function ensureReviewColumn(): Promise<void> {
    if (reviewColumn !== 'unknown') return;
    probe ??= (async () => {
      const { error } = await query(client, 'claims').select('review').limit(1);
      reviewColumn = error?.code === UNDEFINED_COLUMN ? 'absent' : 'present';
    })();
    await probe;
  }

  /*
   * Two reads rather than an embed. `claims.event_id` reaches an event only
   * through the composite key that ties a claim to a member of that event, so
   * PostgREST cannot resolve `events!inner(...)` and answers PGRST200, which
   * surfaced as a blanket 500 on every claim. Fetching the event by id needs no
   * inferable relationship.
   */
  async function getProcessContext(claimId: string) {
    await ensureReviewColumn();
    const { data: claimRow, error: claimError } = await query(client, 'claims')
      .select(claimColumns())
      .eq('id', claimId)
      .maybeSingle();

    if (claimError && claimError.code !== 'PGRST116') {
      throw databaseFailure(claimError);
    }
    if (!claimRow) {
      throw new ServerError('claim_not_found', 404, 'Claim not found', {
        cause: claimError ?? undefined,
      });
    }

    const eventId = (claimRow as { event_id?: unknown }).event_id;
    if (typeof eventId !== 'string') {
      throw databaseFailure(null);
    }

    const { data: eventRow, error: eventError } = await query(client, 'events')
      .select(EVENT_POLICY_COLUMNS)
      .eq('id', eventId)
      .maybeSingle();

    if (eventError && eventError.code !== 'PGRST116') {
      throw databaseFailure(eventError);
    }
    if (!eventRow) {
      throw new ServerError('event_not_found', 404, 'Event not found', {
        cause: eventError ?? undefined,
      });
    }

    return mapProcessRow({ ...(claimRow as object), events: eventRow });
  }

  async function mutatePayment(input: {
    claimId: string;
    expectedState: 'approved' | 'paying';
    nextState: 'paying' | 'paid' | 'payment_failed';
    payment?: PaymentResult;
  }): Promise<PaymentMutationResult> {
    const update = input.payment
      ? { state: input.nextState, payment: input.payment }
      : { state: input.nextState };
    const { data, error } = await query(client, 'claims')
      .update(update)
      .eq('id', input.claimId)
      .eq('state', input.expectedState)
      .is('payment', null)
      .select(claimColumns())
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw databaseFailure(error);
    }
    if (data) {
      return { status: 'saved', claim: mapClaimRow(data).claim };
    }

    const current = await getProcessContext(input.claimId);
    return { status: 'lost_race', claim: current.claim };
  }

  return {
    async assertEventExists(eventId) {
      const { data, error } = await query(client, 'events')
        .select('id')
        .eq('id', eventId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw databaseFailure(error);
      }
      if (!data) {
        throw new ServerError('event_not_found', 404, 'Event not found', {
          cause: error ?? undefined,
        });
      }
    },

    async assertActiveMember(eventId, submitter) {
      const { data, error } = await query(client, 'event_members')
        .select('event_id')
        .eq('event_id', eventId)
        .eq('wallet_address', submitter)
        .eq('active', true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw databaseFailure(error);
      }
      if (!data) {
        throw new ServerError(
          'member_not_found',
          403,
          'Active event membership is required',
          { cause: error ?? undefined },
        );
      }
    },

    async findDuplicateReceipt(eventId, receiptHash): Promise<DuplicateReceipt | null> {
      const { data, error } = await query(client, 'claims')
        .select('id, receipt_analysis, receipt_object_path')
        .eq('event_id', eventId)
        .eq('receipt_sha256', receiptHash)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw databaseFailure(error);
      }
      if (!data) return null;

      const row = data as {
        id: string;
        receipt_analysis: ReceiptAnalysis;
        receipt_object_path: string;
      };
      return {
        claimId: row.id,
        analysis: row.receipt_analysis,
        storagePath: row.receipt_object_path,
      };
    },

    async create(input: CreateClaimRequest): Promise<Claim> {
      await ensureReviewColumn();
      const { data, error } = await query(client, 'claims')
        .insert({
          event_id: input.eventId,
          submitter_wallet: input.submitter,
          receipt_object_path: input.storagePath,
          receipt_sha256: input.analysis.receiptHash,
          fuzzy_key: input.analysis.fuzzyKey,
          state: 'submitted',
          amount: input.amount,
          merchant: input.merchant,
          currency: input.analysis.currency,
          receipt_date: input.receiptDate,
          category: input.category,
          description: input.description,
          receipt_analysis: input.analysis,
        })
        .select(claimColumns())
        .single();

      if (error?.code === '23505') {
        throw new ServerError('duplicate_receipt', 409, 'Receipt already claimed', {
          cause: error,
        });
      }
      if (error?.code === '23503') {
        throw new ServerError(
          'member_not_found',
          403,
          'Active event membership is required',
          { cause: error },
        );
      }
      if (
        error?.code === '23514' &&
        error.message?.includes('active event member')
      ) {
        throw new ServerError(
          'member_not_found',
          403,
          'Active event membership is required',
          { cause: error },
        );
      }
      if (error || !data) {
        throw databaseFailure(error);
      }

      return mapClaimRow(data).claim;
    },

    async listByEvent(eventId): Promise<StoredClaim[]> {
      await ensureReviewColumn();
      const { data, error } = await query(client, 'claims')
        .select(claimColumns())
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(100);

      if (error) {
        throw databaseFailure(error);
      }
      if (!Array.isArray(data)) {
        throw databaseFailure(null);
      }
      return data.map(mapClaimRow);
    },

    getProcessContext,

    async reservePayment(claimId) {
      await ensureReviewColumn();
      return mutatePayment({
        claimId,
        expectedState: 'approved',
        nextState: 'paying',
      });
    },

    async failApprovedPayment(input) {
      await ensureReviewColumn();
      return mutatePayment({
        claimId: input.claimId,
        expectedState: 'approved',
        nextState: 'payment_failed',
        payment: input.payment,
      });
    },

    async finishPayment(input) {
      await ensureReviewColumn();
      return mutatePayment({
        claimId: input.claimId,
        expectedState: 'paying',
        nextState: input.state,
        payment: input.payment,
      });
    },

    /*
     * Guarded on `awaiting_review`, which is the only state a human decision
     * applies to. A claim the engine already settled, or that another
     * treasurer reached first, fails the guard rather than being overwritten.
     */
    /*
     * Clears `decision` but keeps `review`. The policy decision was made about
     * figures that no longer exist and `saveDecision` refuses to run while one
     * is present, so it has to go. The treasurer's note stays: it is why the
     * claim came back, and the next review overwrites it anyway.
     */
    async resubmit(input) {
      await ensureReviewColumn();

      const { data, error } = await query(client, 'claims')
        .update({
          merchant: input.corrections.merchant,
          amount: input.corrections.amount,
          receipt_date: input.corrections.receiptDate,
          category: input.corrections.category,
          description: input.corrections.description,
          state: 'submitted',
          decision: null,
        })
        .eq('id', input.claimId)
        .eq('state', 'needs_correction')
        .select(claimColumns())
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw databaseFailure(error);
      }
      if (data) {
        return { status: 'saved', claim: mapClaimRow(data).claim };
      }

      const current = await getProcessContext(input.claimId);
      if (current.claim.state !== 'needs_correction') {
        return { status: 'lost_race', claim: current.claim };
      }
      throw databaseFailure(null);
    },

    async saveReview(input) {
      await ensureReviewColumn();

      /* Refused before the write rather than after it. A review whose reason
         cannot be stored is not a review anybody can audit later, and a state
         change without one would be worse than no change at all. */
      if (reviewColumn === 'absent') {
        throw new ServerError(
          'database_failed',
          503,
          'Recording a review needs the claims.review column. Apply migration 20260902000000_add_claim_review.sql.',
        );
      }

      const { data, error } = await query(client, 'claims')
        .update({ review: input.review, state: input.state })
        .eq('id', input.claimId)
        .eq('state', 'awaiting_review')
        .select(claimColumns())
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw databaseFailure(error);
      }
      if (data) {
        return { status: 'saved', claim: mapClaimRow(data).claim };
      }

      const current = await getProcessContext(input.claimId);
      if (current.claim.review) {
        return { status: 'lost_race', claim: current.claim };
      }
      throw new ServerError(
        'processing_conflict',
        409,
        `This claim is ${current.claim.state.replace(/_/g, ' ')}, so it is not waiting for a review`,
      );
    },

    async saveDecision(input) {
      await ensureReviewColumn();
      const { data, error } = await query(client, 'claims')
        .update({ decision: input.decision, state: input.state })
        .eq('id', input.claimId)
        .eq('state', 'submitted')
        .is('decision', null)
        .select(claimColumns())
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw databaseFailure(error);
      }
      if (data) {
        return { status: 'saved', claim: mapClaimRow(data).claim };
      }

      const current = await getProcessContext(input.claimId);
      if (current.claim.decision) {
        return { status: 'lost_race', claim: current.claim };
      }
      throw new ServerError(
        'processing_conflict',
        409,
        'Claim is not available for processing',
      );
    },
  };
}
