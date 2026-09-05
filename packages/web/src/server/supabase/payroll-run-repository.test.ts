import { describe, expect, it, vi } from 'vitest';
import type { PayrollBreakdown } from '@tali/shared';

import {
  PayrollRunsTableMissingError,
  createSupabasePayrollRunRepository,
} from './payroll-run-repository';

const breakdown = {
  gross: '3000000000',
  net: '2649000000',
  employerCost: '3448500000',
  bodies: [],
  employee: '0xworker',
  recipients: { epf: '0xepf', socso: '0xsocso', eis: '0xeis' },
} as unknown as PayrollBreakdown;

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  employee_wallet: `0x${'7'.repeat(64)}`,
  payroll_mandate_id: `0x${'3'.repeat(64)}`,
  breakdown,
  status: 'pending',
  digest: null,
  abort_code: null,
  created_at: '2026-09-01T10:00:00.000Z',
};

function client(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      calls[`eq:${column}`] = value;
      return builder;
    }),
    order: vi.fn(() => builder),
    insert: vi.fn((value: unknown) => {
      calls.insert = value;
      return builder;
    }),
    update: vi.fn((value: unknown) => {
      calls.update = value;
      return builder;
    }),
    single: vi.fn(async () => result),
    limit: vi.fn(async () => result),
  };
  return { from: vi.fn(() => builder), calls, builder };
}

describe('createSupabasePayrollRunRepository', () => {
  it('records a pending run with its amounts alongside the breakdown', async () => {
    const supabase = client({ data: row, error: null });
    const repository = createSupabasePayrollRunRepository(supabase as never);

    const run = await repository.create({ mandateId: row.payroll_mandate_id, employee: row.employee_wallet, breakdown });

    expect(supabase.calls.insert).toMatchObject({
      employee_wallet: row.employee_wallet,
      payroll_mandate_id: row.payroll_mandate_id,
      gross: '3000000000',
      net: '2649000000',
      employer_cost: '3448500000',
      status: 'pending',
    });
    expect(run.status).toBe('pending');
    expect(run.mandateId).toBe(row.payroll_mandate_id);
    expect(run.createdAtMs).toBe(Date.parse(row.created_at));
  });

  it('names a missing table rather than reporting a database failure', async () => {
    // The distinction decides whether the app falls back to memory or surfaces
    // an error, so it cannot be collapsed into a generic 500.
    const supabase = client({ data: null, error: { code: 'PGRST205' } });
    const repository = createSupabasePayrollRunRepository(supabase as never);

    await expect(
      repository.create({ mandateId: row.payroll_mandate_id, employee: row.employee_wallet, breakdown }),
    ).rejects.toBeInstanceOf(PayrollRunsTableMissingError);
  });

  it('still reports other database errors as failures', async () => {
    const supabase = client({ data: null, error: { code: '23514', message: 'check' } });
    const repository = createSupabasePayrollRunRepository(supabase as never);

    const error = await repository
      .create({ mandateId: row.payroll_mandate_id, employee: row.employee_wallet, breakdown })
      .catch((thrown: unknown) => thrown);

    expect(error).not.toBeInstanceOf(PayrollRunsTableMissingError);
    expect((error as Error).message).toContain('database operation failed');
  });

  it('writes the digest when a run is paid and the code when it is refused', async () => {
    const paid = client({ data: { ...row, status: 'paid', digest: '0xd' }, error: null });
    await createSupabasePayrollRunRepository(paid as never).markPaid(row.id, '0xd');
    expect(paid.calls.update).toEqual({ status: 'paid', digest: '0xd' });
    expect(paid.calls['eq:id']).toBe(row.id);

    const failed = client({ data: { ...row, status: 'failed', abort_code: 24 }, error: null });
    await createSupabasePayrollRunRepository(failed as never).markFailed(row.id, 24, '0xfailed');
    expect(failed.calls.update).toEqual({
      status: 'failed',
      abort_code: 24,
      digest: '0xfailed',
    });
  });

  it('reads recent runs newest first', async () => {
    const supabase = client({ data: [row], error: null });
    const repository = createSupabasePayrollRunRepository(supabase as never);

    const runs = await repository.listRecent(5);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.employee).toBe(row.employee_wallet);
    expect(supabase.builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(supabase.builder.limit).toHaveBeenCalledWith(5);
  });

  it('filters history by the selected registered mandate', async () => {
    const supabase = client({ data: [row], error: null });
    const repository = createSupabasePayrollRunRepository(supabase as never);
    await expect(repository.listRecentForMandate!(row.payroll_mandate_id, 5)).resolves.toHaveLength(1);
    expect(supabase.calls['eq:payroll_mandate_id']).toBe(row.payroll_mandate_id);
  });

  it('refuses a row it cannot read a timestamp from', async () => {
    const supabase = client({ data: { ...row, created_at: 'not a date' }, error: null });
    const repository = createSupabasePayrollRunRepository(supabase as never);

    await expect(
      repository.create({ mandateId: row.payroll_mandate_id, employee: row.employee_wallet, breakdown }),
    ).rejects.toThrow('database operation failed');
  });
});
