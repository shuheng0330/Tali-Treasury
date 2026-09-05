import { EXPENSE_CATEGORIES } from '@tali/shared';
import type {
  Claim,
  ClaimReview,
  ClaimReviewAction,
  ClaimState,
  ExpenseCategory,
  FxQuote,
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
  fx_quote: FxQuote | null;
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
  payment_attempt_digest: string | null;
  payment_attempt_budget_before: string | number | null;
  payment_attempt_prepared_at: string | null;
  payment_attempt_last_checked_at: string | null;
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
  fx_quote,
  payment,
  created_at,
  updated_at,
  event_members!claims_active_member_fk(display_name)
`;

const REVIEW_COLUMNS = 'review_action, reviewer_wallet, review_reason, reviewed_at';

const ATTEMPT_COLUMNS =
  'payment_attempt_digest, payment_attempt_budget_before, ' +
  'payment_attempt_prepared_at, payment_attempt_last_checked_at';

export const CLAIM_COLUMNS = `${CLAIM_COLUMNS_BASE}, ${REVIEW_COLUMNS}, ${ATTEMPT_COLUMNS}`;

/**
 * The review columns arrive in a migration this app cannot apply itself, and
 * they are in the select list of every claim read. Asking for them on a
 * database that does not have them yet does not degrade one feature — it turns
 * every read of every claim into a 500, which is the whole product.
 *
 * So the column is asked for once. PostgREST answers 42703 when it is absent,
 * and it is dropped from the projection from then on: claims list and process
 * as before, and only recording a decision is unavailable.
 */
type ColumnState = 'unknown' | 'present' | 'absent';

let reviewColumns: ColumnState = 'unknown';

/* The reconciliation columns arrive in their own migration, so a database can
   have one group and not the other. They are probed apart for that reason:
   folding them into the base list is what turned an unapplied migration into a
   500 on every claim read. */
let attemptColumns: ColumnState = 'unknown';

const UNDEFINED_COLUMN = '42703';

function claimColumns(): string {
  return [
    CLAIM_COLUMNS_BASE,
    reviewColumns === 'absent' ? null : REVIEW_COLUMNS,
    attemptColumns === 'absent' ? null : ATTEMPT_COLUMNS,
  ]
    .filter((group) => group !== null)
    .join(', ');
}

const EVENT_POLICY_COLUMNS =
  'treasurer_wallet, mandate_object_id, allowed_categories, starts_at, expires_at';

const CANONICAL_SUI_ID = /^0x[0-9a-f]{64}$/;
const SUI_TRANSACTION_DIGEST = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
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
    (row.review_action ?? null) !== null ||
    (row.reviewer_wallet ?? null) !== null ||
    (row.review_reason ?? null) !== null ||
    (row.reviewed_at ?? null) !== null
  ) {
    const reviewedAtMs = Date.parse(row.reviewed_at ?? '');
    if (
      !row.review_action ||
      !REVIEW_ACTIONS.includes(row.review_action) ||
      !row.reviewer_wallet ||
      !CANONICAL_SUI_ID.test(row.reviewer_wallet) ||
      !Number.isFinite(reviewedAtMs) ||
      ((row.review_action === 'reject' || row.review_action === 'request_correction') &&
        !row.review_reason)
    ) {
      throw databaseFailure(null);
    }
    review = {
      action: row.review_action,
      reviewer: row.reviewer_wallet,
      reason: row.review_reason ?? null,
      reviewedAtMs,
    };
  }

  /* Undefined rather than null means the projection left these out because the
     database has no reconciliation columns yet. That is a claim with no
     attempt, not a malformed row. */
  const attemptDigest = row.payment_attempt_digest ?? null;
  const attemptPreparedAt = row.payment_attempt_prepared_at ?? null;
  const attemptCheckedAt = row.payment_attempt_last_checked_at ?? null;

  let paymentAttempt: Claim['paymentAttempt'] = null;
  if (attemptDigest !== null || attemptPreparedAt !== null || attemptCheckedAt !== null) {
    const preparedAtMs = Date.parse(attemptPreparedAt ?? '');
    const lastCheckedAtMs = attemptCheckedAt === null ? null : Date.parse(attemptCheckedAt);
    if (
      attemptDigest === null ||
      !SUI_TRANSACTION_DIGEST.test(attemptDigest) ||
      !Number.isFinite(preparedAtMs) ||
      (lastCheckedAtMs !== null && !Number.isFinite(lastCheckedAtMs))
    ) {
      throw databaseFailure(null);
    }
    paymentAttempt = { digest: attemptDigest, preparedAtMs, lastCheckedAtMs };
  }

  const claim: Claim = {
    fxQuote: row.fx_quote ?? null,
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
    paymentAttempt,
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
  const attemptBudget = row.payment_attempt_budget_before ?? null;
  const paymentAttemptBudgetBefore =
    attemptBudget === null ? null : String(attemptBudget);
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
    !Number.isFinite(expiresAtMs) ||
    (stored.claim.paymentAttempt === null) !== (paymentAttemptBudgetBefore === null) ||
    (paymentAttemptBudgetBefore !== null && !/^\d+$/.test(paymentAttemptBudgetBefore))
  ) {
    throw databaseFailure(null);
  }

  return {
    claim: stored.claim,
    paymentAttemptBudgetBefore,
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

  /* Asked once per process, not per query, so a database without the columns
     costs one extra round trip in total rather than a failed read each time. */
  /* Paying writes a digest before it signs. Without somewhere to put it, a
     submission whose outcome is unknown would leave nothing to reconcile
     against, so the refusal has to come before the transaction, not after. */
  function assertAttemptColumns(): void {
    if (attemptColumns !== 'absent') return;
    throw new ServerError(
      'database_failed',
      503,
      'Paying a claim needs the payment reconciliation columns. Apply migration 20260902010000_claim_payment_reconciliation.sql.',
    );
  }

  async function ensureReviewColumns(): Promise<void> {
    if (reviewColumns !== 'unknown' && attemptColumns !== 'unknown') return;
    probe ??= (async () => {
      const [review, attempt] = await Promise.all([
        query(client, 'claims').select('review_action').limit(1),
        query(client, 'claims').select('payment_attempt_digest').limit(1),
      ]);
      reviewColumns = review.error?.code === UNDEFINED_COLUMN ? 'absent' : 'present';
      attemptColumns = attempt.error?.code === UNDEFINED_COLUMN ? 'absent' : 'present';
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
      await ensureReviewColumns();
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
    expectedState: 'approved' | 'paying' | 'payment_failed';
    nextState: 'paying' | 'paid' | 'payment_failed';
    payment?: PaymentResult;
    /**
     * A retry starts from a claim that already carries the payment result that
     * failed, so the usual "nothing recorded yet" guard would never match. The
     * state is doing the work in that case: only one caller can move a claim
     * out of `payment_failed`.
     */
    replacingResult?: boolean;
  }): Promise<PaymentMutationResult> {
    const update = input.payment
      ? { state: input.nextState, payment: input.payment }
      : input.replacingResult
        ? {
            state: input.nextState,
            payment: null,
            payment_attempt_digest: null,
            payment_attempt_budget_before: null,
            payment_attempt_prepared_at: null,
            payment_attempt_last_checked_at: null,
          }
        : { state: input.nextState };
    let update_ = query(client, 'claims')
      .update(update)
      .eq('id', input.claimId)
      .eq('state', input.expectedState);
    if (!input.replacingResult) update_ = update_.is('payment', null);
    const { data, error } = await update_
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
      await ensureReviewColumns();
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

    async saveFxQuote({ claim, quote }) {
      let builder = query(client, 'claims')
        .update({ fx_quote: quote, decision: null, state: 'submitted' })
        .eq('id', claim.id)
        .eq('state', claim.state)
        .eq('amount', claim.amount)
        .is('review_action', null)
        .is('payment', null)
        .is('payment_attempt_digest', null);
      builder = claim.fxQuote
        ? builder.eq('fx_quote->>id', claim.fxQuote.id)
        : builder.is('fx_quote', null);
      const { data, error } = await builder
        .select(claimColumns())
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw databaseFailure(error);
      if (data) return { status: 'saved', claim: mapClaimRow(data).claim };
      return {
        status: 'lost_race',
        claim: (await getProcessContext(claim.id)).claim,
      };
    },

    async restartExpiredPaymentQuote(claimId) {
      const { data, error } = await query(client, 'claims')
        .update({
          state: 'submitted',
          decision: null,
          fx_quote: null,
          review_action: null,
          reviewer_wallet: null,
          review_reason: null,
          reviewed_at: null,
          payment: null,
          payment_attempt_digest: null,
          payment_attempt_budget_before: null,
          payment_attempt_prepared_at: null,
          payment_attempt_last_checked_at: null,
        })
        .eq('id', claimId)
        .eq('state', 'payment_failed')
        .select(claimColumns())
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw databaseFailure(error);
      if (data) return { status: 'saved', claim: mapClaimRow(data).claim };

      const current = await getProcessContext(claimId);
      return { status: 'lost_race', claim: current.claim };
    },

    async applyReview(input) {
      await ensureReviewColumns();

      /* Refused before the write rather than after it. A decision whose
         reviewer and reason cannot be stored is not one anybody can audit
         later, and a state change without them would be worse than none. */
      if (reviewColumns === 'absent') {
        throw new ServerError(
          'database_failed',
          503,
          'Recording a decision needs the claims review columns. Apply migration 20260901020000_claim_review_actions.sql.',
        );
      }

      const nextStateByAction = {
        approve: 'approved',
        reject: 'rejected',
        request_correction: 'needs_correction',
      } as const;
      let reviewQuery = query(client, 'claims')
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
        .is('payment', null);
      if (input.quoteId) {
        reviewQuery = reviewQuery.eq('fx_quote->>id', input.quoteId);
      }
      const { data, error } = await reviewQuery
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
    },

    async reservePayment(claimId, from = 'approved') {
      return mutatePayment({
        claimId,
        expectedState: from,
        nextState: 'paying',
        replacingResult: from === 'payment_failed',
      });
    },

    async recordPaymentAttempt(input) {
      assertAttemptColumns();
      const { data, error } = await query(client, 'claims')
        .update({
          payment_attempt_digest: input.digest,
          payment_attempt_budget_before: input.budgetBefore,
          payment_attempt_prepared_at: new Date(input.preparedAtMs).toISOString(),
        })
        .eq('id', input.claimId)
        .eq('state', 'paying')
        .is('payment', null)
        .is('payment_attempt_digest', null)
        .select(claimColumns())
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw databaseFailure(error);
      if (data) return { status: 'saved', claim: mapClaimRow(data).claim };

      const current = await getProcessContext(input.claimId);
      return { status: 'lost_race', claim: current.claim };
    },

    async markPaymentAttemptChecked(input) {
      assertAttemptColumns();
      const { data, error } = await query(client, 'claims')
        .update({
          payment_attempt_last_checked_at: new Date(input.checkedAtMs).toISOString(),
        })
        .eq('id', input.claimId)
        .eq('state', 'paying')
        .eq('payment_attempt_digest', input.digest)
        .is('payment', null)
        .select(claimColumns())
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw databaseFailure(error);
      if (data) return { status: 'saved', claim: mapClaimRow(data).claim };

      const current = await getProcessContext(input.claimId);
      return { status: 'lost_race', claim: current.claim };
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

    /*
     * Guarded on `needs_correction`, which is the only state a member's
     * correction applies to. A claim the engine already settled, or that another
     * treasurer reached first, fails the guard rather than being overwritten.
     */
    /*
     * Clears `decision` but keeps `review`. The policy decision was made about
     * figures that no longer exist and `saveDecision` refuses to run while one
     * is present, so it has to go. The treasurer's note stays: it is why the
     * claim came back, and the next review overwrites it anyway.
     */
    async resubmit(input) {
      const { data, error } = await query(client, 'claims')
        .update({
          merchant: input.corrections.merchant,
          amount: input.corrections.amount,
          receipt_date: input.corrections.receiptDate,
          category: input.corrections.category,
          description: input.corrections.description,
          state: 'submitted',
          decision: null,
          fx_quote: null,
          review_action: null,
          reviewer_wallet: null,
          review_reason: null,
          reviewed_at: null,
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

    async saveDecision(input) {
      let decisionQuery = query(client, 'claims')
        .update({ decision: input.decision, state: input.state })
        .eq('id', input.claimId)
        .eq('state', 'submitted')
        .is('decision', null);
      if (input.quoteId) {
        decisionQuery = decisionQuery.eq('fx_quote->>id', input.quoteId);
      }
      const { data, error } = await decisionQuery
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
