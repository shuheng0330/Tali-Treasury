import type { PayrollBreakdown, PayrollRunView } from '@tali/shared';

import { ServerError } from '../errors';
import type { EnvLike } from '../env';
import { createSuiPayrollExecutor } from '../sui/payroll-executor';
import { createPayrollService, type PayrollService } from './service';
import type {
  PayrollChainPort,
  PayrollRunRepository,
  StatutoryRecipientConfig,
} from './ports';

/**
 * Runs are held in memory until the Supabase tables exist. They survive a
 * page navigation, not a restart, which is enough for a preview and honest
 * about what it is.
 */
function memoryRepository(): PayrollRunRepository {
  const runs = new Map<string, PayrollRunView>();
  let sequence = 0;

  const update = (id: string, patch: Partial<PayrollRunView>): PayrollRunView => {
    const existing = runs.get(id);
    if (!existing) throw new ServerError('claim_not_found', 404, 'Payroll run not found');
    const next = { ...existing, ...patch };
    runs.set(id, next);
    return next;
  };

  return {
    async create({ employee, breakdown }) {
      sequence += 1;
      const view: PayrollRunView = {
        id: `run-${sequence}`,
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
    async listRecent(limit) {
      return [...runs.values()]
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .slice(0, limit);
    },
  };
}

/**
 * Refuses every run until the payroll module is published and its ids are
 * configured. Deliberately fails at `assertReady` rather than producing a
 * plausible fake digest: a payroll run that claims to have paid people and did
 * not is the worst possible thing this codebase could do.
 */
function unconfiguredChain(): PayrollChainPort {
  return {
    assertReady() {
      throw new ServerError(
        'payment_configuration_failed',
        503,
        'The payroll module is not published yet, so no run can be signed',
      );
    },
    async run() {
      throw new ServerError(
        'payment_configuration_failed',
        503,
        'The payroll module is not published yet',
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
      env.PAYROLL_CAP_ID?.trim() &&
      env.PAYROLL_MANDATE_ID?.trim() &&
      env.PAYROLL_EPF_ADDRESS?.trim() &&
      env.PAYROLL_SOCSO_ADDRESS?.trim() &&
      env.PAYROLL_EIS_ADDRESS?.trim(),
  );
}

function recipients(): StatutoryRecipientConfig {
  return {
    epf: process.env.PAYROLL_EPF_ADDRESS ?? '',
    socso: process.env.PAYROLL_SOCSO_ADDRESS ?? '',
    eis: process.env.PAYROLL_EIS_ADDRESS ?? '',
  };
}

let service: PayrollService | undefined;

export function getPayrollService(): PayrollService {
  if (!service) {
    service = createPayrollService({
      runs: memoryRepository(),
      chain: payrollIsLive() ? createSuiPayrollExecutor() : unconfiguredChain(),
      recipients: recipients(),
    });
  }
  return service;
}
