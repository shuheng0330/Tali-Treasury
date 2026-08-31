import { EXPENSE_CATEGORIES } from '@tali/shared';
import type {
  Claim,
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

const CLAIM_COLUMNS = `
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

const PROCESS_COLUMNS = `
  ${CLAIM_COLUMNS},
  events!inner(
    treasurer_wallet,
    mandate_object_id,
    allowed_categories,
    starts_at,
    expires_at
  )
`;

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
    !event.mandate_object_id ||
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
  async function getProcessContext(claimId: string) {
    const { data, error } = await query(client, 'claims')
      .select(PROCESS_COLUMNS)
      .eq('id', claimId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw databaseFailure(error);
    }
    if (!data) {
      throw new ServerError('claim_not_found', 404, 'Claim not found', {
        cause: error ?? undefined,
      });
    }
    return mapProcessRow(data);
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
