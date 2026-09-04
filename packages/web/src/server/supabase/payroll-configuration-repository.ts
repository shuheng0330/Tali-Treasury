import type { Address } from '@tali/shared';

import { ServerError } from '../errors';
import type {
  PayrollConfigurationSnapshot,
  PayrollRegistrationRepository,
  PayrollStatutoryTermSnapshot,
} from '../payroll/registration';

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
  maybeSingle(): Promise<QueryResult>;
}

interface SupabaseDataClient {
  from(table: string): unknown;
}

interface PayrollConfigurationRow {
  creation_digest: string;
  package_id: string;
  coin_type: string;
  mandate_id: string;
  cap_id: string;
  employer_wallet: string;
  cap_owner_wallet: string;
  approved_employees: unknown;
  statutory_terms: unknown;
  net_min_bps: string;
  initial_budget: string;
  max_per_run: string;
  expiry_ms: string;
}

const COLUMNS = [
  'creation_digest',
  'package_id',
  'coin_type',
  'mandate_id',
  'cap_id',
  'employer_wallet',
  'cap_owner_wallet',
  'approved_employees',
  'statutory_terms',
  'net_min_bps',
  'initial_budget',
  'max_per_run',
  'expiry_ms',
].join(', ');
const ADDRESS = /^0x[0-9a-f]{64}$/;
const DIGEST = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const UNSIGNED = /^(0|[1-9][0-9]*)$/;

function query(client: SupabaseDataClient): QueryBuilder {
  return client.from('payroll_configurations') as QueryBuilder;
}

function databaseFailure(error: DatabaseError | null): ServerError {
  return new ServerError('database_failed', 500, 'The database operation failed', {
    cause: error ?? undefined,
  });
}

function conflict(error?: DatabaseError | null): ServerError {
  return new ServerError(
    'payroll_registration_conflict',
    409,
    'This payroll transaction conflicts with an existing registration',
    { cause: error ?? undefined },
  );
}

function isAddressVector(value: unknown, length: number): value is string[] {
  return Array.isArray(value) && value.length === length && value.every(
    (entry) => typeof entry === 'string' && ADDRESS.test(entry),
  );
}

function isTerms(value: unknown): value is PayrollStatutoryTermSnapshot[] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const term = entry as Record<string, unknown>;
    return typeof term.recipient === 'string' && ADDRESS.test(term.recipient)
      && typeof term.minBps === 'string' && UNSIGNED.test(term.minBps)
      && typeof term.wageCap === 'string' && UNSIGNED.test(term.wageCap);
  });
}

function mapRow(input: unknown): PayrollConfigurationSnapshot {
  if (!input || typeof input !== 'object') throw databaseFailure(null);
  const row = input as PayrollConfigurationRow;
  const scalarAddresses = [
    row.package_id,
    row.mandate_id,
    row.cap_id,
    row.employer_wallet,
    row.cap_owner_wallet,
  ];
  if (
    !DIGEST.test(row.creation_digest)
    || scalarAddresses.some((value) => typeof value !== 'string' || !ADDRESS.test(value))
    || typeof row.coin_type !== 'string'
    || !row.coin_type.includes('::')
    || !isAddressVector(row.approved_employees, 1)
    || !isTerms(row.statutory_terms)
    || ![row.net_min_bps, row.initial_budget, row.max_per_run, row.expiry_ms].every(
      (value) => typeof value === 'string' && UNSIGNED.test(value),
    )
  ) {
    throw databaseFailure(null);
  }
  return {
    creationDigest: row.creation_digest,
    packageId: row.package_id,
    coinType: row.coin_type,
    mandateId: row.mandate_id,
    capId: row.cap_id,
    employerWallet: row.employer_wallet as Address,
    capOwnerWallet: row.cap_owner_wallet,
    approvedEmployees: row.approved_employees,
    statutoryTerms: row.statutory_terms,
    netMinBps: row.net_min_bps,
    initialBudget: row.initial_budget,
    maxPerRun: row.max_per_run,
    expiryMs: row.expiry_ms,
  };
}

function toRow(snapshot: PayrollConfigurationSnapshot): PayrollConfigurationRow {
  return {
    creation_digest: snapshot.creationDigest,
    package_id: snapshot.packageId,
    coin_type: snapshot.coinType,
    mandate_id: snapshot.mandateId,
    cap_id: snapshot.capId,
    employer_wallet: snapshot.employerWallet,
    cap_owner_wallet: snapshot.capOwnerWallet,
    approved_employees: snapshot.approvedEmployees,
    statutory_terms: snapshot.statutoryTerms,
    net_min_bps: snapshot.netMinBps,
    initial_budget: snapshot.initialBudget,
    max_per_run: snapshot.maxPerRun,
    expiry_ms: snapshot.expiryMs,
  };
}

function sameSnapshot(
  left: PayrollConfigurationSnapshot,
  right: PayrollConfigurationSnapshot,
): boolean {
  return left.creationDigest === right.creationDigest
    && left.packageId === right.packageId
    && left.coinType === right.coinType
    && left.mandateId === right.mandateId
    && left.capId === right.capId
    && left.employerWallet === right.employerWallet
    && left.capOwnerWallet === right.capOwnerWallet
    && left.netMinBps === right.netMinBps
    && left.initialBudget === right.initialBudget
    && left.maxPerRun === right.maxPerRun
    && left.expiryMs === right.expiryMs
    && left.approvedEmployees.length === right.approvedEmployees.length
    && left.approvedEmployees.every((employee, index) => employee === right.approvedEmployees[index])
    && left.statutoryTerms.length === right.statutoryTerms.length
    && left.statutoryTerms.every((term, index) => {
      const candidate = right.statutoryTerms[index];
      return candidate !== undefined
        && term.recipient === candidate.recipient
        && term.minBps === candidate.minBps
        && term.wageCap === candidate.wageCap;
    });
}

export function createSupabasePayrollConfigurationRepository(
  client: SupabaseDataClient,
): PayrollRegistrationRepository {
  return {
    async register(snapshot) {
      const { data, error } = await query(client)
        .insert(toRow(snapshot))
        .select(COLUMNS)
        .single();
      if (!error) return { configuration: mapRow(data), created: true };
      if (error.code !== '23505') throw databaseFailure(error);

      const existing = await query(client)
        .select(COLUMNS)
        .eq('creation_digest', snapshot.creationDigest)
        .maybeSingle();
      if (existing.error) throw databaseFailure(existing.error);
      if (existing.data === null) throw conflict(error);
      const configuration = mapRow(existing.data);
      if (!sameSnapshot(configuration, snapshot)) throw conflict(error);
      return { configuration, created: false };
    },
  };
}
