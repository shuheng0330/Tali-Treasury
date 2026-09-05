import type { Address, PayrollBreakdown, PayrollRunStatus, PayrollRunView } from '@tali/shared';

import type { PayrollRunRepository } from '../payroll/ports';
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
  update(value: unknown): QueryBuilder;
  single(): Promise<QueryResult>;
  limit(count: number): Promise<QueryResult>;
}

interface SupabaseDataClient {
  from(table: string): unknown;
}

interface PayrollRunRow {
  id: string;
  employee_wallet: string;
  payroll_mandate_id: string | null;
  breakdown: PayrollBreakdown;
  status: PayrollRunStatus;
  digest: string | null;
  abort_code: number | null;
  created_at: string;
}

const RUN_COLUMNS = 'id, payroll_mandate_id, employee_wallet, breakdown, status, digest, abort_code, created_at';

/** PostgREST for a table that is not in the schema cache, or not there at all. */
const TABLE_MISSING = new Set(['PGRST205', 'PGRST106', '42P01']);

export class PayrollRunsTableMissingError extends Error {
  constructor(cause?: DatabaseError | null) {
    super('The payroll_runs table has not been created yet');
    this.name = 'PayrollRunsTableMissingError';
    this.cause = cause ?? undefined;
  }
}

function databaseFailure(error: DatabaseError | null): ServerError {
  return new ServerError('database_failed', 500, 'The database operation failed', {
    cause: error ?? undefined,
  });
}

function failure(error: DatabaseError | null): Error {
  if (error?.code && TABLE_MISSING.has(error.code)) {
    return new PayrollRunsTableMissingError(error);
  }
  return databaseFailure(error);
}

function mapRow(input: unknown): PayrollRunView {
  if (!input || typeof input !== 'object') {
    throw databaseFailure(null);
  }
  const row = input as PayrollRunRow;
  const createdAtMs = Date.parse(row.created_at);
  if (!row.id || !Number.isFinite(createdAtMs) || !row.breakdown) {
    throw databaseFailure(null);
  }

  return {
    id: row.id,
    mandateId: row.payroll_mandate_id as PayrollRunView['mandateId'],
    employee: row.employee_wallet as Address,
    breakdown: row.breakdown,
    status: row.status,
    digest: row.digest,
    abortCode: row.abort_code,
    createdAtMs,
  };
}

function query(client: SupabaseDataClient, table: string): QueryBuilder {
  return client.from(table) as QueryBuilder;
}

export function createSupabasePayrollRunRepository(
  client: SupabaseDataClient,
): PayrollRunRepository {
  async function update(
    runId: string,
    patch: Record<string, unknown>,
  ): Promise<PayrollRunView> {
    const { data, error } = await query(client, 'payroll_runs')
      .update(patch)
      .eq('id', runId)
      .select(RUN_COLUMNS)
      .single();

    if (error) throw failure(error);
    return mapRow(data);
  }

  return {
    async create({ mandateId, employee, breakdown }) {
      const { data, error } = await query(client, 'payroll_runs')
        .insert({
          employee_wallet: employee,
          payroll_mandate_id: mandateId,
          gross: breakdown.gross,
          net: breakdown.net,
          employer_cost: breakdown.employerCost,
          breakdown,
          status: 'pending',
        })
        .select(RUN_COLUMNS)
        .single();

      if (error) throw failure(error);
      return mapRow(data);
    },

    async markPaid(runId, digest) {
      return update(runId, { status: 'paid', digest });
    },

    async markFailed(runId, abortCode) {
      return update(runId, { status: 'failed', abort_code: abortCode });
    },

    async listRecentForMandate(mandateId, limit) {
      const { data, error } = await query(client, 'payroll_runs')
        .select(RUN_COLUMNS)
        .eq('payroll_mandate_id', mandateId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw failure(error);
      if (!Array.isArray(data)) throw databaseFailure(null);
      return data.map(mapRow);
    },
    async listRecent(limit) {
      const { data, error } = await query(client, 'payroll_runs')
        .select(RUN_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw failure(error);
      if (!Array.isArray(data)) throw databaseFailure(null);
      return data.map(mapRow);
    },
  };
}
