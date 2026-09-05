import type {
  Address,
  Amount,
  LeaveKind,
  LeaveRequest,
  LeaveStatus,
  OvertimeClaim,
  OvertimeKind,
  OvertimeStatus,
} from '@tali/shared';

import type { OvertimeRepository } from '../overtime/ports';
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
  maybeSingle(): Promise<QueryResult>;
  limit(count: number): Promise<QueryResult>;
}

interface SupabaseDataClient {
  from(table: string): unknown;
}

interface OvertimeClaimRow {
  id: string;
  payroll_mandate_id: string | null;
  employee_wallet: string;
  worked_on: string;
  kind: OvertimeKind;
  hours: string;
  reason: string;
  status: OvertimeStatus;
  monthly_wage: string;
  pay: string;
  decision_reason: string | null;
  decided_at: string | null;
  payroll_run_id: string | null;
  created_at: string;
}

interface LeaveRequestRow {
  id: string;
  employee_wallet: string;
  start_on: string;
  end_on: string;
  days: string;
  kind: LeaveKind;
  reason: string;
  status: LeaveStatus;
  monthly_wage: string;
  deduction: string;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
}

const CLAIM_COLUMNS =
  'id, payroll_mandate_id, employee_wallet, worked_on, kind, hours, reason, status, monthly_wage, pay, decision_reason, decided_at, payroll_run_id, created_at';
const LEAVE_COLUMNS =
  'id, employee_wallet, start_on, end_on, days, kind, reason, status, monthly_wage, deduction, decision_reason, decided_at, created_at';

/** PostgREST for a table that is not in the schema cache, or not there at all. */
const TABLE_MISSING = new Set(['PGRST205', 'PGRST106', '42P01']);

export class OvertimeTablesMissingError extends Error {
  constructor(cause?: DatabaseError | null) {
    super('The overtime_claims and leave_requests tables have not been created yet');
    this.name = 'OvertimeTablesMissingError';
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
    return new OvertimeTablesMissingError(error);
  }
  return databaseFailure(error);
}

function decidedAt(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw databaseFailure(null);
  return parsed;
}

function mapClaimRow(input: unknown): OvertimeClaim {
  if (!input || typeof input !== 'object') throw databaseFailure(null);
  const row = input as OvertimeClaimRow;
  const createdAtMs = Date.parse(row.created_at);
  if (!row.id || !Number.isFinite(createdAtMs) || !row.pay || !row.monthly_wage) {
    throw databaseFailure(null);
  }

  return {
    id: row.id,
    mandateId: row.payroll_mandate_id,
    employee: row.employee_wallet as Address,
    workedOn: row.worked_on,
    kind: row.kind,
    hours: row.hours,
    reason: row.reason,
    status: row.status,
    monthlyWage: row.monthly_wage as Amount,
    pay: row.pay as Amount,
    decisionReason: row.decision_reason,
    decidedAtMs: decidedAt(row.decided_at),
    runId: row.payroll_run_id,
    createdAtMs,
  };
}

function mapLeaveRow(input: unknown): LeaveRequest {
  if (!input || typeof input !== 'object') throw databaseFailure(null);
  const row = input as LeaveRequestRow;
  const createdAtMs = Date.parse(row.created_at);
  if (!row.id || !Number.isFinite(createdAtMs) || !row.monthly_wage) {
    throw databaseFailure(null);
  }

  return {
    id: row.id,
    employee: row.employee_wallet as Address,
    startOn: row.start_on,
    endOn: row.end_on,
    days: row.days,
    kind: row.kind,
    reason: row.reason,
    status: row.status,
    monthlyWage: row.monthly_wage as Amount,
    deduction: row.deduction as Amount,
    decisionReason: row.decision_reason,
    decidedAtMs: decidedAt(row.decided_at),
    createdAtMs,
  };
}

function query(client: SupabaseDataClient, table: string): QueryBuilder {
  return client.from(table) as QueryBuilder;
}

function decisionPatch(decision: {
  status: string;
  reason: string | null;
  decidedAtMs: number;
}): Record<string, unknown> {
  return {
    status: decision.status,
    decision_reason: decision.reason,
    decided_at: new Date(decision.decidedAtMs).toISOString(),
  };
}

export function createSupabaseOvertimeRepository(
  client: SupabaseDataClient,
): OvertimeRepository {
  return {
    async createClaim(input) {
      const { data, error } = await query(client, 'overtime_claims')
        .insert({
          payroll_mandate_id: input.mandateId,
          employee_wallet: input.employee,
          worked_on: input.workedOn,
          kind: input.kind,
          hours: input.hours,
          reason: input.reason,
          status: 'submitted',
          monthly_wage: input.monthlyWage,
          pay: input.pay,
        })
        .select(CLAIM_COLUMNS)
        .single();

      if (error) throw failure(error);
      return mapClaimRow(data);
    },

    async listClaims(limit) {
      const { data, error } = await query(client, 'overtime_claims')
        .select(CLAIM_COLUMNS)
        .order('worked_on', { ascending: false })
        .limit(limit);

      if (error) throw failure(error);
      if (!Array.isArray(data)) throw databaseFailure(null);
      return data.map(mapClaimRow);
    },

    async findClaim(id) {
      const { data, error } = await query(client, 'overtime_claims')
        .select(CLAIM_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error) throw failure(error);
      return data === null ? null : mapClaimRow(data);
    },

    /* The status is part of the where clause, not a check performed before it.
       Two employers deciding the same claim at once then produce one decision
       and one conflict rather than the second quietly replacing the first. */
    async decideClaim(decision) {
      const { data, error } = await query(client, 'overtime_claims')
        .update(decisionPatch(decision))
        .eq('id', decision.id)
        .eq('status', 'submitted')
        .select(CLAIM_COLUMNS)
        .maybeSingle();

      if (error) throw failure(error);
      return data === null ? null : mapClaimRow(data);
    },

    async settleClaims({ employee, runId }) {
      const result = (await query(client, 'overtime_claims')
        .update({ status: 'paid', payroll_run_id: runId })
        .eq('employee_wallet', employee)
        .eq('status', 'approved')
        .select(CLAIM_COLUMNS)) as unknown as QueryResult;

      if (result.error) throw failure(result.error);
      if (!Array.isArray(result.data)) throw databaseFailure(null);
      return result.data.map(mapClaimRow);
    },

    async createLeave(input) {
      const { data, error } = await query(client, 'leave_requests')
        .insert({
          employee_wallet: input.employee,
          start_on: input.startOn,
          end_on: input.endOn,
          days: input.days,
          kind: input.kind,
          reason: input.reason,
          status: 'submitted',
          monthly_wage: input.monthlyWage,
          deduction: input.deduction,
        })
        .select(LEAVE_COLUMNS)
        .single();

      if (error) throw failure(error);
      return mapLeaveRow(data);
    },

    async listLeave(limit) {
      const { data, error } = await query(client, 'leave_requests')
        .select(LEAVE_COLUMNS)
        .order('start_on', { ascending: false })
        .limit(limit);

      if (error) throw failure(error);
      if (!Array.isArray(data)) throw databaseFailure(null);
      return data.map(mapLeaveRow);
    },

    async findLeave(id) {
      const { data, error } = await query(client, 'leave_requests')
        .select(LEAVE_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error) throw failure(error);
      return data === null ? null : mapLeaveRow(data);
    },

    async decideLeave(decision) {
      const { data, error } = await query(client, 'leave_requests')
        .update(decisionPatch(decision))
        .eq('id', decision.id)
        .eq('status', 'submitted')
        .select(LEAVE_COLUMNS)
        .maybeSingle();

      if (error) throw failure(error);
      return data === null ? null : mapLeaveRow(data);
    },
  };
}
