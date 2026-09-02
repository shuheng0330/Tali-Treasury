import { EXPENSE_CATEGORIES } from '@tali/shared';
import type {
  Claim,
  ClaimReview,
  ClaimReviewAction,
  ClaimState,
  ExpenseCategory,
  PaymentResult,
  PolicyDecision,
  ReceiptAnalysis,
} from '@tali/shared';

import type {
  ClaimRepository,
  DuplicateReceipt,
  LegacyCreateClaimRequest,
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
  review_action: ClaimReviewAction | null;
  reviewer_wallet: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
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

export const CLAIM_COLUMNS = `
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
  review_action,
  reviewer_wallet,
  review_reason,
  reviewed_at,
  payment,
  created_at,
  updated_at,
  event_members!claims_active_member_fk(display_name)
`;

const EVENT_POLICY_COLUMNS =
  'treasurer_wallet, mandate_object_id, allowed_categories, starts_at, expires_at';

const CANONICAL_SUI_ID = /^0x[0-9a-f]{64}$/;
const REVIEW_ACTIONS: readonly ClaimReviewAction[] = [
  'approve',
  'reject',
  'request_correction',
];

function databaseFailure(error: DatabaseError | null): ServerError {
  return new ServerError('database_failed', 500, 'The database operation failed', {
    cause: error ?? undefined,
  });
}

export function mapClaimRow(input: unknown): StoredClaim {
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

  let review: ClaimReview | null = null;
  if (
    row.review_action !== null ||
    row.reviewer_wallet !== null ||
    row.review_reason !== null ||
    row.reviewed_at !== null
  ) {
    const reviewedAtMs = Date.parse(row.reviewed_at ?? '');
    if (
      row.review_action === null ||
      !REVIEW_ACTIONS.includes(row.review_action) ||
      row.reviewer_wallet === null ||
      !CANONICAL_SUI_ID.test(row.reviewer_wallet) ||
      !Number.isFinite(reviewedAtMs) ||
      ((row.review_action === 'reject' || row.review_action === 'request_correction') &&
        row.review_reason === null)
    ) {
      throw databaseFailure(null);
    }
    review = {
      action: row.review_action,
      reviewer: row.reviewer_wallet,
      reason: row.review_reason,
      reviewedAtMs,
    };
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
    review,
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
  /*
   * Two reads rather than an embed. `claims.event_id` reaches an event only
   * through the composite key that ties a claim to a member of that event, so
   * PostgREST cannot resolve `events!inner(...)` and answers PGRST200, which
   * surfaced as a blanket 500 on every claim. Fetching the event by id needs no
   * inferable relationship.
   */
  async function getProcessContext(claimId: string) {
    const { data: claimRow, error: claimError } = await query(client, 'claims')
      .select(CLAIM_COLUMNS)
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
      .select(CLAIM_COLUMNS)
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

    async assertEventViewer(eventId, viewer) {
      const { data, error } = await query(client, 'events')
        .select('treasurer_wallet')
        .eq('id', eventId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw databaseFailure(error);
      if (!data) {
        throw new ServerError('event_not_found', 404, 'Event not found', {
          cause: error ?? undefined,
        });
      }
      const treasurer = (data as { treasurer_wallet?: unknown }).treasurer_wallet;
      if (typeof treasurer !== 'string') throw databaseFailure(null);
      if (treasurer.toLowerCase() === viewer.toLowerCase()) return;

      const membership = await query(client, 'event_members')
        .select('event_id')
        .eq('event_id', eventId)
        .eq('wallet_address', viewer)
        .eq('active', true)
        .maybeSingle();
      if (membership.error && membership.error.code !== 'PGRST116') {
        throw databaseFailure(membership.error);
      }
      if (!membership.data) {
        throw new ServerError(
          'member_not_found',
          403,
          'Event access requires active membership or the configured treasurer',
          { cause: membership.error ?? undefined },
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

    async create(input: LegacyCreateClaimRequest): Promise<Claim> {
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
        .select(CLAIM_COLUMNS)
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
      const { data, error } = await query(client, 'claims')
        .select(CLAIM_COLUMNS)
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

    async applyReview(input) {
      const nextStateByAction = {
        approve: 'paying',
        reject: 'rejected',
        request_correction: 'needs_correction',
      } as const;
      const { data, error } = await query(client, 'claims')
        .update({
          state: nextStateByAction[input.review.action],
          review_action: input.review.action,
          reviewer_wallet: input.review.reviewer,
          review_reason: input.review.reason,
          reviewed_at: new Date(input.review.reviewedAtMs).toISOString(),
        })
        .eq('id', input.claimId)
        .eq('state', 'awaiting_review')
        .is('review_action', null)
        .is('payment', null)
        .select(CLAIM_COLUMNS)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw databaseFailure(error);
      }
      if (data) {
        return { status: 'saved', claim: mapClaimRow(data).claim };
      }

      const current = await getProcessContext(input.claimId);
      return { status: 'lost_race', claim: current.claim };
    },

    async reservePayment(claimId) {
      return mutatePayment({
        claimId,
        expectedState: 'approved',
        nextState: 'paying',
      });
    },

    async failApprovedPayment(input) {
      return mutatePayment({
        claimId: input.claimId,
        expectedState: 'approved',
        nextState: 'payment_failed',
        payment: input.payment,
      });
    },

    async finishPayment(input) {
      return mutatePayment({
        claimId: input.claimId,
        expectedState: 'paying',
        nextState: input.state,
        payment: input.payment,
      });
    },

    async saveDecision(input) {
      const { data, error } = await query(client, 'claims')
        .update({ decision: input.decision, state: input.state })
        .eq('id', input.claimId)
        .eq('state', 'submitted')
        .is('decision', null)
        .select(CLAIM_COLUMNS)
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
