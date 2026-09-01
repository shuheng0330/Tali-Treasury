import type { PayrollBreakdown, PayrollRunView, StatutoryBody } from '@tali/shared';
import { STATUTORY_BODIES } from '@tali/shared';

import { ServerError } from '../errors';
import { computeStatutory, type StatutoryInput } from './statutory';
import type {
  PayrollChainPort,
  PayrollRunRepository,
  StatutoryRecipientConfig,
} from './ports';
import type { PayrollRequest } from './validation';

export interface PayrollService {
  preview(request: PayrollRequest): PayrollBreakdown;
  run(request: PayrollRequest): Promise<PayrollRunView>;
  listRecent(limit?: number): Promise<PayrollRunView[]>;
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
  recipients: StatutoryRecipientConfig;
}): PayrollService {
  function build(request: PayrollRequest): PayrollBreakdown {
    return {
      ...computeStatutory(toInput(request)),
      employee: request.employee,
      recipients: deps.recipients,
    };
  }

  return {
    preview: build,

    async run(request) {
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

      const breakdown = build(request);

      /* Persisted before anything is signed. A run that vanishes because the
         process died mid-submission is worse than one recorded as failed. */
      const record = await deps.runs.create({
        employee: request.employee,
        breakdown,
      });

      const amountFor = (body: StatutoryBody): string => {
        const found = breakdown.bodies.find((entry) => entry.body === body);
        if (!found) return '0';
        // The enforcement screen sends one base unit so the floor refuses it.
        return request.underpay === body ? '1' : found.total;
      };

      const submission = await deps.chain.run({
        employee: request.employee,
        gross: breakdown.gross,
        net: breakdown.net,
        statutoryAmounts: STATUTORY_BODIES.map(amountFor),
      });

      /* A refusal is the contract deciding. It is recorded with its code and
         returned as a normal result, never thrown: the caller needs to render
         which rule spoke, and no retry is attempted because a duplicate payroll
         run is worse than a failed one. */
      if (submission.status === 'refused') {
        return deps.runs.markFailed(record.id, submission.abortCode);
      }

      return deps.runs.markPaid(record.id, submission.digest);
    },

    listRecent(limit = 20) {
      return deps.runs.listRecent(limit);
    },
  };
}
