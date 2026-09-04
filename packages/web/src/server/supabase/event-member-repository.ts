import type { Address, EventMember } from '@tali/shared';

import type { EventMemberRepository } from '../events/members';
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
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  insert(value: unknown): QueryBuilder;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
}

interface SupabaseDataClient {
  from(table: string): unknown;
}

interface EventMemberRow {
  event_id: string;
  wallet_address: string;
  display_name: string;
  created_at: string;
}

const MEMBER_COLUMNS = 'event_id, wallet_address, display_name, created_at';
const CANONICAL_SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

function query(client: SupabaseDataClient, table: string): QueryBuilder {
  return client.from(table) as QueryBuilder;
}

function databaseFailure(error: DatabaseError | null): ServerError {
  return new ServerError('database_failed', 500, 'The database operation failed', {
    cause: error ?? undefined,
  });
}

function mapMember(input: unknown): EventMember {
  if (!input || typeof input !== 'object') throw databaseFailure(null);
  const row = input as EventMemberRow;
  const addedAtMs = Date.parse(row.created_at);
  if (
    !row.event_id ||
    !CANONICAL_SUI_ADDRESS.test(row.wallet_address) ||
    !row.display_name ||
    row.display_name !== row.display_name.trim() ||
    !Number.isFinite(addedAtMs)
  ) {
    throw databaseFailure(null);
  }
  return {
    eventId: row.event_id,
    address: row.wallet_address as Address,
    displayName: row.display_name,
    addedAtMs,
  };
}

export function createSupabaseEventMemberRepository(
  client: SupabaseDataClient,
): EventMemberRepository {
  return {
    async findTreasurer(eventId) {
      const { data, error } = await query(client, 'events')
        .select('treasurer_wallet')
        .eq('id', eventId)
        .maybeSingle();
      if (error) throw databaseFailure(error);
      if (data === null) return null;
      const treasurer = (data as { treasurer_wallet?: unknown }).treasurer_wallet;
      if (typeof treasurer !== 'string' || !CANONICAL_SUI_ADDRESS.test(treasurer)) {
        throw databaseFailure(null);
      }
      return treasurer as Address;
    },

    async listActive(eventId) {
      const pending = query(client, 'event_members')
        .select(MEMBER_COLUMNS)
        .eq('event_id', eventId)
        .eq('active', true)
        .order('created_at', { ascending: true })
        .order('wallet_address', { ascending: true });
      const { data, error } = await (pending as unknown as Promise<QueryResult>);
      if (error) throw databaseFailure(error);
      if (!Array.isArray(data)) throw databaseFailure(null);
      return data.map(mapMember);
    },

    async create({ eventId, address, displayName }) {
      const { data, error } = await query(client, 'event_members')
        .insert({
          event_id: eventId,
          wallet_address: address,
          display_name: displayName,
          active: true,
        })
        .select(MEMBER_COLUMNS)
        .single();
      if (error?.code === '23505') {
        throw new ServerError(
          'member_already_exists',
          409,
          'This wallet is already on the event roster',
          { cause: error },
        );
      }
      if (error) throw databaseFailure(error);
      return mapMember(data);
    },
  };
}
