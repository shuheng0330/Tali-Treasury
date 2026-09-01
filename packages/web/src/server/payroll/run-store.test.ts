import { describe, expect, it, vi } from 'vitest';
import type { PayrollBreakdown, PayrollRunView } from '@tali/shared';

import { fallbackStore, memoryOnlyStore } from './run-store';
import type { PayrollRunRepository } from './ports';
import { PayrollRunsTableMissingError } from '../supabase/payroll-run-repository';
import { ServerError } from '../errors';

const breakdown = { gross: '1', net: '1', employerCost: '1' } as PayrollBreakdown;

function view(id: string): PayrollRunView {
  return {
    id,
    employee: '0xworker',
    breakdown,
    status: 'pending',
    digest: null,
    abortCode: null,
    createdAtMs: 0,
  };
}

function repository(overrides: Partial<PayrollRunRepository> = {}): PayrollRunRepository {
  return {
    create: vi.fn(async () => view('db-1')),
    markPaid: vi.fn(async () => ({ ...view('db-1'), status: 'paid' as const })),
    markFailed: vi.fn(async () => ({ ...view('db-1'), status: 'failed' as const })),
    listRecent: vi.fn(async () => [view('db-1')]),
    ...overrides,
  };
}

function missing(): PayrollRunRepository {
  const fail = () =>
    vi.fn(async () => {
      throw new PayrollRunsTableMissingError();
    });
  return { create: fail(), markPaid: fail(), markFailed: fail(), listRecent: fail() };
}

describe('fallbackStore', () => {
  it('uses the database and reports the runs as persisted', async () => {
    const store = fallbackStore(repository(), repository());

    await store.create({ employee: '0xworker', breakdown });

    expect(store.persisted()).toBe(true);
    expect(store.reason()).toBeNull();
  });

  it('keeps a run whose table is missing, and says it will not survive', async () => {
    const memory = repository({ create: vi.fn(async () => view('mem-1')) });
    const store = fallbackStore(missing(), memory);

    const run = await store.create({ employee: '0xworker', breakdown });

    expect(run.id).toBe('mem-1');
    expect(store.persisted()).toBe(false);
    expect(store.reason()).toContain('payroll_runs table');
  });

  it('finishes a fallen-back run in the same place it started', async () => {
    // The run only exists in memory. Sending its completion to the database
    // would fail to find it and lose the outcome of a real payment.
    const memory = repository();
    const primary = missing();
    const store = fallbackStore(primary, memory);

    await store.create({ employee: '0xworker', breakdown });
    await store.markPaid('mem-1', '0xdigest');

    expect(memory.markPaid).toHaveBeenCalledOnce();
    expect(primary.markPaid).toHaveBeenCalledTimes(0);
  });

  it('retries the database on a read, so applying the migration needs no restart', async () => {
    let tableExists = false;
    const primary = repository({
      listRecent: vi.fn(async () => {
        if (!tableExists) throw new PayrollRunsTableMissingError();
        return [view('db-1')];
      }),
    });
    const store = fallbackStore(primary, repository({ listRecent: vi.fn(async () => []) }));

    expect(await store.listRecent(10)).toEqual([]);
    expect(store.persisted()).toBe(false);

    tableExists = true;
    expect(await store.listRecent(10)).toEqual([view('db-1')]);
    expect(store.persisted()).toBe(true);
    expect(store.reason()).toBeNull();
  });

  it('does not hide a real database failure behind memory', async () => {
    const primary = repository({
      create: vi.fn(async () => {
        throw new ServerError('database_failed', 500, 'The database operation failed');
      }),
    });
    const memory = repository();
    const store = fallbackStore(primary, memory);

    await expect(store.create({ employee: '0xworker', breakdown })).rejects.toThrow(
      'The database operation failed',
    );
    expect(memory.create).toHaveBeenCalledTimes(0);
  });
});

describe('memoryOnlyStore', () => {
  it('never claims to have persisted anything', async () => {
    const store = memoryOnlyStore(repository(), 'Supabase is not configured');

    await store.create({ employee: '0xworker', breakdown });

    expect(store.persisted()).toBe(false);
    expect(store.reason()).toBe('Supabase is not configured');
  });
});
