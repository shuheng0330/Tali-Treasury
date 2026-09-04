import type { Address } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import type { PayrollConfigurationSnapshot } from '../payroll/registration';
import { createSupabasePayrollConfigurationRepository } from './payroll-configuration-repository';

const snapshot: PayrollConfigurationSnapshot = {
  creationDigest: '4'.repeat(44),
  packageId: `0x${'1'.repeat(64)}`,
  coinType: `0x${'2'.repeat(64)}::usdc::USDC`,
  mandateId: `0x${'3'.repeat(64)}`,
  capId: `0x${'4'.repeat(64)}`,
  employerWallet: `0x${'5'.repeat(64)}` as Address,
  capOwnerWallet: `0x${'6'.repeat(64)}`,
  approvedEmployees: [`0x${'7'.repeat(64)}`],
  statutoryTerms: [
    { recipient: `0x${'8'.repeat(64)}`, minBps: '2300', wageCap: '0' },
    { recipient: `0x${'9'.repeat(64)}`, minBps: '225', wageCap: '6000000000' },
    { recipient: `0x${'a'.repeat(64)}`, minBps: '40', wageCap: '6000000000' },
  ],
  netMinBps: '7000',
  initialBudget: '100000000000',
  maxPerRun: '10000000000',
  expiryMs: '4102444800000',
};

const row = {
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

function client(results: Array<{ data: unknown; error: unknown }>) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let queryIndex = 0;
  return {
    from: vi.fn(() => {
      const result = results[queryIndex++] ?? { data: null, error: null };
      const query: Record<string, unknown> = {};
      for (const method of ['insert', 'select', 'eq']) {
        query[method] = vi.fn((...args: unknown[]) => {
          calls.push({ method, args });
          return query;
        });
      }
      query.single = vi.fn(async () => result);
      query.maybeSingle = vi.fn(async () => result);
      return query;
    }),
    calls,
  };
}

describe('createSupabasePayrollConfigurationRepository', () => {
  it('inserts and maps an immutable verified snapshot', async () => {
    const supabase = client([{ data: row, error: null }]);
    const repository = createSupabasePayrollConfigurationRepository(supabase as never);

    await expect(repository.register(snapshot)).resolves.toEqual({
      configuration: snapshot,
      created: true,
    });
    expect(supabase.calls).toContainEqual({ method: 'insert', args: [row] });
  });

  it('reloads an exact digest after a uniqueness race and reports replay', async () => {
    const jsonbRow = {
      ...row,
      statutory_terms: snapshot.statutoryTerms.map((term) => ({
        wageCap: term.wageCap,
        minBps: term.minBps,
        recipient: term.recipient,
      })),
    };
    const supabase = client([
      { data: null, error: { code: '23505', message: 'constraint details' } },
      { data: jsonbRow, error: null },
    ]);
    const repository = createSupabasePayrollConfigurationRepository(supabase as never);

    await expect(repository.register(snapshot)).resolves.toEqual({
      configuration: snapshot,
      created: false,
    });
    expect(supabase.calls).toContainEqual({
      method: 'eq',
      args: ['creation_digest', snapshot.creationDigest],
    });
  });

  it('fails safely when another digest already claimed the mandate or cap', async () => {
    const repository = createSupabasePayrollConfigurationRepository(
      client([
        { data: null, error: { code: '23505', message: 'mandate_id_key details' } },
        { data: null, error: null },
      ]) as never,
    );
    await expect(repository.register(snapshot)).rejects.toMatchObject({
      code: 'payroll_registration_conflict',
      status: 409,
    });
  });

  it('rejects a digest collision whose stored snapshot differs', async () => {
    const repository = createSupabasePayrollConfigurationRepository(
      client([
        { data: null, error: { code: '23505' } },
        { data: { ...row, cap_id: `0x${'b'.repeat(64)}` }, error: null },
      ]) as never,
    );
    await expect(repository.register(snapshot)).rejects.toMatchObject({
      code: 'payroll_registration_conflict',
      status: 409,
    });
  });

  it('sanitizes database errors and malformed rows', async () => {
    const privateFailure = createSupabasePayrollConfigurationRepository(
      client([{ data: null, error: { code: 'XX000', message: 'private database details' } }]) as never,
    );
    const error = await privateFailure.register(snapshot).catch((value) => value);
    expect(error).toMatchObject({ code: 'database_failed', status: 500 });
    expect((error as Error).message).not.toContain('private database details');

    const malformed = createSupabasePayrollConfigurationRepository(
      client([{ data: { ...row, approved_employees: [] }, error: null }]) as never,
    );
    await expect(malformed.register(snapshot)).rejects.toMatchObject({
      code: 'database_failed',
      status: 500,
    });
  });
});
