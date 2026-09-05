import type { PayrollBreakdown, PayrollRunView } from '@tali/shared';

import { ServerError } from '../errors';
import type { EnvLike } from '../env';
import { createSupabaseRateCache } from '../fx/cache';
import { createOpenExchangeRateReader } from '../fx/rates';
import { createSuiPayrollExecutor } from '../sui/payroll-executor';
import { createServerSupabaseClient } from '../supabase/client';
import { createSupabasePayrollRunRepository } from '../supabase/payroll-run-repository';
import { createSupabasePayrollConfigurationRepository } from '../supabase/payroll-configuration-repository';
import { createPayrollConfigurationService } from './configurations';
import { requireEmployerWallet } from '../auth/authorization';
import { createPayrollService, type PayrollService } from './service';
import { fallbackStore, memoryOnlyStore, type PayrollRunStore } from './run-store';
import type {
  PayrollChainPort,
  PayrollRunRepository,
} from './ports';

/**
 * Held on `globalThis` rather than in a module variable.
 *
 * A route handler and a page are separate module instances under Turbopack, so
 * a plain module-level Map gave the API one set of runs and the history screen
 * an empty one. Anything reached from both has to outlive the module.
 */
const MEMORY_RUNS = Symbol.for('tali.payroll.memoryRuns');

interface MemoryState {
  runs: Map<string, PayrollRunView>;
  sequence: number;
}

function memoryState(): MemoryState {
  const host = globalThis as unknown as Record<symbol, MemoryState | undefined>;
  host[MEMORY_RUNS] ??= { runs: new Map(), sequence: 0 };
  return host[MEMORY_RUNS];
}

/**
 * Where a run lives when the database cannot take it. Survives a page
 * navigation, not a restart, and the history screen says so.
 */
function memoryRepository(): PayrollRunRepository {
  const { runs } = memoryState();

  const update = (id: string, patch: Partial<PayrollRunView>): PayrollRunView => {
    const existing = runs.get(id);
    if (!existing) {
      throw new ServerError('payroll_run_not_found', 404, 'Payroll run not found');
    }
    const next = { ...existing, ...patch };
    runs.set(id, next);
    return next;
  };

  return {
    async create({ mandateId, employee, breakdown }) {
      const state = memoryState();
      state.sequence += 1;
      const view: PayrollRunView = {
        id: `run-${state.sequence}`,
        mandateId: mandateId as PayrollRunView['mandateId'],
        employee,
        breakdown: breakdown as PayrollBreakdown,
        status: 'pending',
        digest: null,
        abortCode: null,
        createdAtMs: Date.now(),
      };
      runs.set(view.id, view);
      return view;
    },
    async markPaid(id, digest) {
      return update(id, { status: 'paid', digest });
    },
    async markFailed(id, abortCode) {
      return update(id, { status: 'failed', abortCode });
    },
    async listRecentForMandate(mandateId, limit) {
      return [...runs.values()]
        .filter((run) => run.mandateId === mandateId)
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .slice(0, limit);
    },
    async listRecent(limit) {
      return [...runs.values()].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, limit);
    },
  };
}

/**
 * Refuses every run until the whole payroll configuration is present — package,
 * mandate, capability, signer and the three statutory recipients. Deliberately
 * fails at `assertReady` rather than producing a plausible fake digest: a
 * payroll run that claims to have paid people and did not is the worst possible
 * thing this codebase could do.
 *
 * The message names the configuration rather than the module. Any one of seven
 * missing values reaches this path, and the module has been published since
 * package v2, so blaming publication was wrong in every case but one — and the
 * enforcement screen quotes this reason to the reader verbatim.
 */
function unconfiguredChain(): PayrollChainPort {
  return {
    assertReady() {
      throw new ServerError(
        'payment_configuration_failed',
        503,
        'Payroll is not fully configured yet, so no run can be signed',
      );
    },
    async run() {
      throw new ServerError(
        'payment_configuration_failed',
        503,
        'Payroll is not fully configured yet',
      );
    },
  };
}

/**
 * The signing path is used once the module is published and its ids are set.
 * Everything up to that point stays on the refusal above, so a half-configured
 * deployment cannot quietly sign anything.
 */
export function payrollIsLive(env: EnvLike = process.env): boolean {
  return Boolean(
    env.AGENT_PRIVATE_KEY?.trim() &&
      (env.SUI_NETWORK ?? 'testnet').trim().toLowerCase() === 'testnet',
  );
}

function runStore(): PayrollRunStore {
  const memory = memoryRepository();
  try {
    return fallbackStore(
      createSupabasePayrollRunRepository(createServerSupabaseClient() as never),
      memory,
    );
  } catch {
    return memoryOnlyStore(memory, 'Supabase is not configured');
  }
}

let service: PayrollService | undefined;
let store: PayrollRunStore | undefined;
let rates: ReturnType<typeof createOpenExchangeRateReader> | undefined;

export function getPayrollRateReader(): ReturnType<typeof createOpenExchangeRateReader> {
  if (!rates) {
    const client = createServerSupabaseClient() as never;
    rates = createOpenExchangeRateReader({
      appId: () => process.env.OPEN_EXCHANGE_RATES_APP_ID,
      cache: createSupabaseRateCache(client),
    });
  }
  return rates;
}

export function getPayrollService(): PayrollService {
  if (!service) {
    const client = createServerSupabaseClient() as never;
    store = runStore();
    service = createPayrollService({
      runs: store,
      chain: payrollIsLive() ? createSuiPayrollExecutor() : unconfiguredChain(),
      configurations: createPayrollConfigurationService({
        configurations: createSupabasePayrollConfigurationRepository(client),
        employer: requireEmployerWallet(),
      }),
      rates: getPayrollRateReader(),
    });
  }
  return service;
}

/** Whether the runs just read or written will outlive the process. */
export function payrollRunsArePersisted(): { persisted: boolean; reason: string | null } {
  getPayrollService();
  return { persisted: store?.persisted() ?? false, reason: store?.reason() ?? null };
}
