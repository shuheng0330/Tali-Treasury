import { ServerError } from '../errors';
import type {
  PayrollSetupRegistration,
  PayrollSetupRegistrationRepository,
} from '../payroll/setup-registration';
import type { VerifiedPayrollSetup } from '../payroll/setup-verification';

interface DatabaseError { code?: string; }
interface QueryResult { data: unknown; error: DatabaseError | null; }
interface QueryBuilder {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  insert(value: unknown): QueryBuilder;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
}
interface SupabaseDataClient { from(table: string): unknown; }

const COLUMNS = 'id, setup_digest, setup_checkpoint, package_id, coin_type, mandate_object_id, payroll_cap_object_id, employer_wallet, employee_wallet, cap_recipient_wallet, budget_usdc, max_per_run_usdc, expiry_ms, created_at';

function failure(cause?: unknown): ServerError {
  return new ServerError('database_failed', 500, 'The payroll registration could not be stored.', { cause });
}

function mapRow(value: unknown): PayrollSetupRegistration {
  if (!value || typeof value !== 'object') throw failure();
  const row = value as Record<string, unknown>;
  const createdAtMs = Date.parse(String(row.created_at));
  if (!row.id || !Number.isFinite(createdAtMs)) throw failure();
  return {
    id: String(row.id),
    digest: String(row.setup_digest),
    checkpoint: String(row.setup_checkpoint),
    packageId: String(row.package_id),
    coinType: String(row.coin_type),
    mandateId: String(row.mandate_object_id),
    capId: String(row.payroll_cap_object_id),
    employer: String(row.employer_wallet),
    employee: String(row.employee_wallet),
    capRecipient: String(row.cap_recipient_wallet),
    budgetUsdc: String(row.budget_usdc),
    maxPerRunUsdc: String(row.max_per_run_usdc),
    expiryMs: Number(row.expiry_ms),
    createdAtMs,
  };
}

function query(client: SupabaseDataClient): QueryBuilder {
  return client.from('payroll_configurations') as QueryBuilder;
}

export function createSupabasePayrollSetupRepository(
  client: SupabaseDataClient,
): PayrollSetupRegistrationRepository {
  async function findByDigest(digest: string): Promise<PayrollSetupRegistration | null> {
    const { data, error } = await query(client)
      .select(COLUMNS)
      .eq('setup_digest', digest)
      .maybeSingle();
    if (error) throw failure(error);
    return data ? mapRow(data) : null;
  }

  return {
    findByDigest,
    async create(verified: VerifiedPayrollSetup) {
      const { data, error } = await query(client)
        .insert({
          setup_digest: verified.digest,
          setup_checkpoint: verified.checkpoint,
          package_id: verified.packageId,
          coin_type: verified.coinType,
          mandate_object_id: verified.mandateId,
          payroll_cap_object_id: verified.capId,
          employer_wallet: verified.employer,
          employee_wallet: verified.employee,
          cap_recipient_wallet: verified.capRecipient,
          budget_usdc: verified.budgetUsdc,
          max_per_run_usdc: verified.maxPerRunUsdc,
          expiry_ms: verified.expiryMs,
        })
        .select(COLUMNS)
        .single();
      if (!error) return mapRow(data);
      if (error.code === '23505') {
        const existing = await findByDigest(verified.digest);
        if (existing) return existing;
        throw new ServerError(
          'processing_conflict',
          409,
          'This payroll mandate or capability is already registered.',
          { cause: error },
        );
      }
      throw failure(error);
    },
  };
}
