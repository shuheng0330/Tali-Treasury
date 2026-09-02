import type { AnalysisDraftRepository } from '../claims/ports';
import { ServerError } from '../errors';
import { CLAIM_COLUMNS, mapClaimRow } from './claim-repository';

interface DatabaseError {
  code?: string;
  message?: string;
}

interface QueryResult {
  data: unknown;
  error: DatabaseError | null;
}

interface QueryBuilder {
  insert(value: unknown): QueryBuilder;
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  single(): Promise<QueryResult>;
}

interface SupabaseDraftClient {
  from(table: string): unknown;
  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult>;
}

function databaseFailure(error: DatabaseError | null): ServerError {
  return new ServerError('database_failed', 500, 'The database operation failed', {
    cause: error ?? undefined,
  });
}

function mapDraftError(error: DatabaseError): ServerError {
  if (error.code === 'PT410') {
    return new ServerError(
      'analysis_draft_expired',
      410,
      'Receipt analysis expired; analyze the receipt again',
      { cause: error },
    );
  }
  if (error.code === 'PT409') {
    return new ServerError(
      'analysis_draft_consumed',
      409,
      'Receipt analysis is no longer available',
      { cause: error },
    );
  }
  if (error.code === 'PT403') {
    return new ServerError(
      'analysis_draft_forbidden',
      403,
      'Receipt analysis is not available to this wallet',
      { cause: error },
    );
  }
  if (error.code === '23505') {
    return new ServerError('duplicate_receipt', 409, 'Receipt already claimed', {
      cause: error,
    });
  }
  return databaseFailure(error);
}

export function createSupabaseAnalysisDraftRepository(
  client: SupabaseDraftClient,
): AnalysisDraftRepository {
  return {
    async create(input) {
      const query = client.from('receipt_analysis_drafts') as QueryBuilder;
      const { data, error } = await query
        .insert({
          event_id: input.eventId,
          wallet_address: input.walletAddress,
          receipt_object_path: input.storagePath,
          receipt_sha256: input.receiptHash,
          analysis: input.analysis,
          expires_at: new Date(input.expiresAtMs).toISOString(),
          created_at: new Date(input.createdAtMs).toISOString(),
        })
        .select('id, expires_at')
        .single();
      if (error) throw databaseFailure(error);
      if (!data || typeof data !== 'object') throw databaseFailure(null);
      const row = data as { id?: unknown; expires_at?: unknown };
      const expiresAtMs = Date.parse(String(row.expires_at));
      if (typeof row.id !== 'string' || !Number.isFinite(expiresAtMs)) {
        throw databaseFailure(null);
      }
      return { id: row.id, expiresAtMs };
    },

    async consumeToClaim(input) {
      const { data, error } = await client.rpc('create_claim_from_analysis_draft', {
        p_draft_id: input.draftId,
        p_wallet_address: input.walletAddress,
        p_amount: input.amount,
        p_merchant: input.merchant,
        p_receipt_date: input.receiptDate,
        p_category: input.category,
        p_description: input.description,
        p_now: new Date(input.nowMs).toISOString(),
      });
      if (error) throw mapDraftError(error);
      const rpcRow = Array.isArray(data) ? data[0] : data;
      const claimId =
        rpcRow &&
        typeof rpcRow === 'object' &&
        typeof (rpcRow as { id?: unknown }).id === 'string'
          ? (rpcRow as { id: string }).id
          : null;
      if (!claimId) throw databaseFailure(null);

      const query = client.from('claims') as QueryBuilder;
      const loaded = await query.select(CLAIM_COLUMNS).eq('id', claimId).single();
      if (loaded.error) throw databaseFailure(loaded.error);
      return mapClaimRow(loaded.data).claim;
    },
  };
}
