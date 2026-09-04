import { describe, expect, it, vi } from 'vitest';

import type { VerifiedPayrollSetup } from '../payroll/setup-verification';
import { createSupabasePayrollSetupRepository } from './payroll-setup-repository';

const verified: VerifiedPayrollSetup = {
  digest: '4'.repeat(44),
  checkpoint: '123',
  packageId: `0x${'c'.repeat(64)}`,
  mandateId: `0x${'1'.repeat(64)}`,
  capId: `0x${'2'.repeat(64)}`,
  employer: `0x${'a'.repeat(64)}`,
  employee: `0x${'b'.repeat(64)}`,
  capRecipient: `0x${'d'.repeat(64)}`,
  coinType: `0x${'e'.repeat(64)}::usdc::USDC`,
  budgetUsdc: '12371338',
  maxPerRunUsdc: '12371338',
  expiryMs: 1_788_281_999_000,
};
const row = {
  id: 'registration-id',
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
  created_at: '2026-09-04T12:00:00.000Z',
};

function client(results: Array<{ data: unknown; error: { code?: string } | null }>) {
  const calls: Record<string, unknown> = {};
  const next = () => Promise.resolve(results.shift() ?? { data: null, error: null });
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => { calls[`eq:${column}`] = value; return builder; }),
    insert: vi.fn((value: unknown) => { calls.insert = value; return builder; }),
    single: vi.fn(next),
    maybeSingle: vi.fn(next),
  };
  return { from: vi.fn(() => builder), calls };
}

describe('Supabase payroll setup repository', () => {
  it('stores only the server-verified fields', async () => {
    const supabase = client([{ data: row, error: null }]);
    const result = await createSupabasePayrollSetupRepository(supabase as never).create(verified);

    expect(supabase.calls.insert).toMatchObject({
      setup_digest: verified.digest,
      mandate_object_id: verified.mandateId,
      payroll_cap_object_id: verified.capId,
      employer_wallet: verified.employer,
    });
    expect(result).toMatchObject({ id: row.id, mandateId: verified.mandateId });
  });

  it('returns null when a digest has not been registered', async () => {
    const supabase = client([{ data: null, error: null }]);
    await expect(
      createSupabasePayrollSetupRepository(supabase as never).findByDigest(verified.digest),
    ).resolves.toBeNull();
    expect(supabase.calls['eq:setup_digest']).toBe(verified.digest);
  });

  it('recovers a concurrent insert of the same digest', async () => {
    const supabase = client([
      { data: null, error: { code: '23505' } },
      { data: row, error: null },
    ]);
    await expect(
      createSupabasePayrollSetupRepository(supabase as never).create(verified),
    ).resolves.toMatchObject({ id: row.id });
  });
});
