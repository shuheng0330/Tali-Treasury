import type {
  WalletAuthRepository,
  WalletChallengeRecord,
  WalletSessionRecord,
} from '../auth/service';
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
  insert(value: unknown): QueryBuilder;
  select(columns: string): QueryBuilder;
  update(value: unknown): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  is(column: string, value: unknown): QueryBuilder;
  gt(column: string, value: unknown): QueryBuilder;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
}

interface SupabaseWalletAuthClient {
  from(table: string): unknown;
  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult>;
}

interface ChallengeRow {
  id: string;
  wallet_address: string;
  message: string;
  expires_at: string;
  consumed_at: string | null;
}

interface SessionRow {
  wallet_address: string;
  expires_at: string;
}

const CHALLENGE_COLUMNS =
  'id, wallet_address, message, expires_at, consumed_at';
const SESSION_COLUMNS = 'wallet_address, expires_at';
const CANONICAL_SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

function databaseFailure(error: DatabaseError | null): ServerError {
  return new ServerError('database_failed', 500, 'The database operation failed', {
    cause: error ?? undefined,
  });
}

function authenticationFailed(error?: DatabaseError | null): ServerError {
  return new ServerError(
    'authentication_failed',
    401,
    'Wallet authentication failed',
    { cause: error ?? undefined },
  );
}

function mapChallenge(input: unknown): WalletChallengeRecord {
  if (!input || typeof input !== 'object') throw databaseFailure(null);
  const row = input as ChallengeRow;
  const expiresAtMs = Date.parse(row.expires_at);
  const consumedAtMs = row.consumed_at === null ? null : Date.parse(row.consumed_at);
  if (
    typeof row.id !== 'string' ||
    !CANONICAL_SUI_ADDRESS.test(row.wallet_address) ||
    typeof row.message !== 'string' ||
    !Number.isFinite(expiresAtMs) ||
    (consumedAtMs !== null && !Number.isFinite(consumedAtMs))
  ) {
    throw databaseFailure(null);
  }
  return {
    id: row.id,
    address: row.wallet_address,
    message: row.message,
    expiresAtMs,
    consumedAtMs,
  };
}

function mapSession(input: unknown): WalletSessionRecord {
  const value = Array.isArray(input) ? input[0] : input;
  if (!value || typeof value !== 'object') throw databaseFailure(null);
  const row = value as SessionRow;
  const expiresAtMs = Date.parse(row.expires_at);
  if (!CANONICAL_SUI_ADDRESS.test(row.wallet_address) || !Number.isFinite(expiresAtMs)) {
    throw databaseFailure(null);
  }
  return { address: row.wallet_address, expiresAtMs };
}

export function createSupabaseWalletAuthRepository(
  client: SupabaseWalletAuthClient,
): WalletAuthRepository {
  return {
    async createChallenge(input) {
      const query = client.from('wallet_auth_challenges') as QueryBuilder;
      const { data, error } = await query
        .insert({
          wallet_address: input.address,
          message: input.message,
          expires_at: new Date(input.expiresAtMs).toISOString(),
          created_at: new Date(input.createdAtMs).toISOString(),
        })
        .select(CHALLENGE_COLUMNS)
        .single();
      if (error) throw databaseFailure(error);
      return mapChallenge(data);
    },

    async getChallenge(id) {
      const query = client.from('wallet_auth_challenges') as QueryBuilder;
      const { data, error } = await query
        .select(CHALLENGE_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw databaseFailure(error);
      return data === null ? null : mapChallenge(data);
    },

    async consumeChallenge(input) {
      const { data, error } = await client.rpc(
        'create_wallet_session_from_challenge',
        {
          p_challenge_id: input.challengeId,
          p_token_hash: input.tokenHash,
          p_session_expires_at: new Date(input.expiresAtMs).toISOString(),
          p_wallet_address: input.address,
          p_now: new Date(input.nowMs).toISOString(),
        },
      );
      if (error?.code === 'PT401') throw authenticationFailed(error);
      if (error) throw databaseFailure(error);
      return mapSession(data);
    },

    async findSession(tokenHash, nowMs) {
      const query = client.from('wallet_sessions') as QueryBuilder;
      const { data, error } = await query
        .select(SESSION_COLUMNS)
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .gt('expires_at', new Date(nowMs).toISOString())
        .maybeSingle();
      if (error) throw databaseFailure(error);
      return data === null ? null : mapSession(data);
    },

    async revokeSession(tokenHash, nowMs) {
      const query = client.from('wallet_sessions') as QueryBuilder;
      const { error } = await query
        .update({ revoked_at: new Date(nowMs).toISOString() })
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .gt('expires_at', new Date(nowMs).toISOString())
        .select('id')
        .maybeSingle();
      if (error) throw databaseFailure(error);
    },
  };
}
