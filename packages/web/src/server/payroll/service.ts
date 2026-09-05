import type { PayrollBreakdown, PayrollRunView, StatutoryBody } from '@tali/shared';
import { STATUTORY_BODIES } from '@tali/shared';

import { ServerError } from '../errors';
import type { FxRate } from '../fx/rates';
import { quotePayrollSplit } from './fx';
import { computeStatutory, type StatutoryInput } from './statutory';
import type {
  PayrollChainPort,
  PayrollRunRepository,
  StatutoryRecipientConfig,
} from './ports';
import type { PayrollRequest } from './validation';
import type { PayrollConfigurationService } from './configurations';

export interface PayrollService {
  preview(actor: string, request: PayrollRequest): Promise<PayrollBreakdown>;
  run(actor: string, request: PayrollRequest): Promise<PayrollRunView>;
  listRecent(actor: string, mandateId: string, limit?: number): Promise<PayrollRunView[]>;
}

function toInput(request: PayrollRequest): StatutoryInput {
  return {
    gross: request.gross,
    age: request.age,
    citizenship: request.citizenship,
  };
}

export function createPayrollService(deps: {
  runs: PayrollRunRepository;
  chain: PayrollChainPort;
  configurations: PayrollConfigurationService;
  rates: () => Promise<FxRate>;
  now?: () => number;
}): PayrollService {
  async function build(actor: string, request: PayrollRequest) {
    const configuration = await deps.configurations.requireAuthorized(actor, request.mandateId);
    const employee = configuration.view.employee;
    const recipients = Object.fromEntries(configuration.view.statutoryRules.map((rule) => [rule.body, rule.recipient])) as StatutoryRecipientConfig;
    const source = computeStatutory(toInput(request));
    const rate = await deps.rates();
    return { breakdown: {
      ...quotePayrollSplit(source, rate, (deps.now ?? Date.now)()),
      employee,
      recipients,
    }, configuration };
  }

  return {
    async preview(actor, request) {
      return (await build(actor, request)).breakdown;
    },

    async run(actor, request) {
      /* The mandate carries one set of floors, and those describe one class of
         worker. A worker at 60 or over pays no EIS at all and a quarter of the
         EPF rate, so a correct split for them is refused by floors written for
         staff under 60 — abort 24, blaming the arithmetic for a mismatch in
         who the mandate is for. Preview still answers for any class. */
      if (request.age >= 60 || request.citizenship === 'foreign') {
        throw new ServerError(
          'invalid_request',
          400,
          'This mandate covers local staff under 60. Another class of worker needs its own mandate, with its own statutory floors.',
        );
      }

      deps.chain.assertReady();

      const { breakdown, configuration } = await build(actor, request);
      if (configuration.role !== 'employer') {
        throw new ServerError('payroll_forbidden', 403, 'Only the employer can run payroll');
      }
      const quoted = breakdown.fxConversion;
      if (
        !request.fxApproval ||
        !quoted ||
        request.fxApproval.myrPerUsd !== quoted.myrPerUsd ||
        request.fxApproval.rateTimestampMs !== quoted.rateTimestampMs
      ) {
        throw new ServerError(
          'fx_quote_invalid',
          409,
          'The payroll quote changed or was not approved. Preview it again before running payroll.',
        );
      }

      /* Persisted before anything is signed. A run that vanishes because the
         process died mid-submission is worse than one recorded as failed. */
      const record = await deps.runs.create({
        mandateId: configuration.snapshot.mandateId,
        employee: breakdown.employee,
        breakdown,
      });

      const amountFor = (body: StatutoryBody): string => {
        const found = breakdown.bodies.find((entry) => entry.body === body);
        if (!found) return '0';
        // The enforcement screen sends one base unit so the floor refuses it.
        return request.underpay === body ? '1' : found.total;
      };

      const submission = await deps.chain.run({
        packageId: configuration.snapshot.packageId,
        payrollCapId: configuration.snapshot.capId,
        mandateId: configuration.snapshot.mandateId,
        capOwnerWallet: configuration.snapshot.capOwnerWallet,
        employee: breakdown.employee,
        gross: breakdown.gross,
        net: breakdown.net,
        statutoryAmounts: STATUTORY_BODIES.map(amountFor),
        recordRefusal: request.underpay !== undefined,
      });

      /* A refusal is the contract deciding. It is recorded with its code and
         returned as a normal result, never thrown: the caller needs to render
         which rule spoke, and no retry is attempted because a duplicate payroll
         run is worse than a failed one. */
      if (submission.status === 'refused') {
        return deps.runs.markFailed(record.id, submission.abortCode, submission.digest);
      }

      return deps.runs.markPaid(record.id, submission.digest);
    },

    async listRecent(actor, mandateId, limit = 20) {
      if (!deps.runs.listRecentForMandate) {
        throw new ServerError('database_failed', 500, 'The database operation failed');
      }
      await deps.configurations.requireAuthorized(actor, mandateId);
      return deps.runs.listRecentForMandate(mandateId, limit);
    },
  };
}
