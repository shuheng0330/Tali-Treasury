import type { Address, SalaryStreamRegistrationView } from '@tali/shared';

import { ServerError } from '../errors';
import type { SalaryStreamRecord, SalaryStreamRegistry } from '../streams/opening';

interface DatabaseError { code?: string; message?: string }
interface QueryResult { data: unknown; error: DatabaseError | null }
interface QueryBuilder {
  insert(value: unknown): QueryBuilder;
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
}
interface SupabaseDataClient { from(table: string): unknown }

interface SalaryStreamRow {
  stream_id: string;
  payroll_mandate_id: string;
  creation_digest: string;
  employee_wallet: string;
  total_amount: string;
  started_at_ms: number | string;
  ends_at_ms: number | string;
  created_at: string;
}

const COLUMNS = 'stream_id, payroll_mandate_id, creation_digest, employee_wallet, total_amount, started_at_ms, ends_at_ms, created_at';
const ADDRESS = /^0x[0-9a-f]{64}$/;
const DIGEST = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const POSITIVE = /^[1-9][0-9]*$/;

function failure(error: DatabaseError | null): ServerError {
  return new ServerError('database_failed', 500, 'The database operation failed', { cause: error ?? undefined });
}

function query(client: SupabaseDataClient): QueryBuilder {
  return client.from('salary_streams') as QueryBuilder;
}

function mapRow(value: unknown): SalaryStreamRecord {
  if (!value || typeof value !== 'object') throw failure(null);
  const row = value as SalaryStreamRow;
  const startedAtMs = Number(row.started_at_ms);
  const endsAtMs = Number(row.ends_at_ms);
  const createdAtMs = Date.parse(row.created_at);
  if (
    !ADDRESS.test(row.stream_id)
    || !ADDRESS.test(row.payroll_mandate_id)
    || !ADDRESS.test(row.employee_wallet)
    || !DIGEST.test(row.creation_digest)
    || !POSITIVE.test(row.total_amount)
    || !Number.isSafeInteger(startedAtMs)
    || !Number.isSafeInteger(endsAtMs)
    || endsAtMs <= startedAtMs
    || !Number.isFinite(createdAtMs)
  ) throw failure(null);
  return {
    streamId: row.stream_id as SalaryStreamRegistrationView['streamId'],
    mandateId: row.payroll_mandate_id as SalaryStreamRegistrationView['mandateId'],
    creationDigest: row.creation_digest,
    employee: row.employee_wallet as Address,
    totalAmount: row.total_amount,
    startedAtMs,
    endsAtMs,
    createdAtMs,
  };
}

export function createSupabaseSalaryStreamRepository(client: SupabaseDataClient): SalaryStreamRegistry {
  return {
    async findByMandateId(mandateId) {
      const result = await query(client).select(COLUMNS).eq('payroll_mandate_id', mandateId).maybeSingle();
      if (result.error) throw failure(result.error);
      return result.data === null ? null : mapRow(result.data);
    },
    async create(stream) {
      const result = await query(client).insert({
        stream_id: stream.streamId,
        payroll_mandate_id: stream.mandateId,
        creation_digest: stream.creationDigest,
        employee_wallet: stream.employee,
        total_amount: stream.totalAmount,
        started_at_ms: stream.startedAtMs,
        ends_at_ms: stream.endsAtMs,
      }).select(COLUMNS).single();
      if (result.error) throw failure(result.error);
      return mapRow(result.data);
    },
  };
}
