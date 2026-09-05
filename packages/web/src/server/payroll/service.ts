import type {
  Address,
  ObjectId,
  PayrollBreakdown,
  PayrollRunView,
  StatutoryBody,
  StatutorySplit,
} from '@tali/shared';
import { STATUTORY_BODIES, STATUTORY_BODY_LABEL, toDisplay } from '@tali/shared';

import { ServerError } from '../errors';
import type { FxRate } from '../fx/rates';
import { quotePayrollSplit } from './fx';
import {
  EMPTY_PERIOD,
  assemblePeriod,
  periodProblem,
  type PayrollPeriod,
  type PayrollPeriodSource,
} from './period';
import {
  clearsFloor,
  computeStatutory,
  overtimeHeadroom,
  type StatutoryInput,
} from './statutory';
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

/**
 * The mandate's spending room, read from the chain rather than the registration
 * snapshot: the budget falls with every run and the module has no way to add to
 * it, so what registration recorded stops being true after the first payroll.
 */
export interface PayrollBudgetPort {
  read(mandateId: ObjectId): Promise<{ spendable: bigint; maxPerRun: bigint }>;
}

function toInput(request: PayrollRequest, period: PayrollPeriod): StatutoryInput {
  return {
    gross: request.gross,
    age: request.age,
    citizenship: request.citizenship,
    overtime: period.overtime,
    unpaidLeave: period.unpaidLeave,
  };
}

function bpsPercent(bps: bigint): string {
  const whole = bps / 100n;
  const fraction = bps % 100n;
  return fraction === 0n ? `${whole}%` : `${whole}.${fraction.toString().padStart(2, '0')}%`;
}

function usdc(value: bigint): string {
  return `${toDisplay(value.toString(), 6)} USDC`;
}

/**
 * Why a lawful split would still be refused, in the employer's terms.
 *
 * The headroom is the sentence that matters: it names the largest overtime this
 * wage can carry, so the answer is a decision rather than a dead end.
 */
function floorRefusal(input: {
  body: StatutoryBody;
  minBps: bigint;
  statutory: StatutoryInput;
  split: StatutorySplit;
  period: PayrollPeriod;
}): string {
  const label = STATUTORY_BODY_LABEL[input.body];
  const floor = bpsPercent(input.minBps);

  if (BigInt(input.split.overtime ?? '0') === 0n) {
    return (
      `The correct ${label} contribution for this wage is under the mandate's ${floor} floor, ` +
      `so the contract would refuse this run.`
    );
  }

  const headroom = overtimeHeadroom(input.statutory, input.body, input.minBps);
  return (
    `${input.period.hours} hours of approved overtime, worth RM ${toDisplay(input.period.overtime)}, ` +
    `take ${label} under the mandate's ${floor} floor. The contract measures every floor against ` +
    `total wages payable, and overtime is outside ${label} wages, so this run would abort. ` +
    `This wage carries RM ${toDisplay(headroom)} of overtime at most.`
  );
}

export function createPayrollService(deps: {
  runs: PayrollRunRepository;
  chain: PayrollChainPort;
  configurations: PayrollConfigurationService;
  rates: () => Promise<FxRate>;
  /**
   * Approved overtime and leave. Until it is wired a run is the base wage
   * alone, which is what payroll did before the claim flow existed.
   */
  period?: PayrollPeriodSource;
  budget?: PayrollBudgetPort;
  now?: () => number;
}): PayrollService {
  async function readPeriod(mandateId: ObjectId, employee: Address): Promise<PayrollPeriod> {
    if (!deps.period) return EMPTY_PERIOD;
    const [claims, leave] = await Promise.all([
      deps.period.listOvertime({ mandateId, employee }),
      deps.period.listLeave({ mandateId, employee }),
    ]);
    return assemblePeriod({ mandateId, employee, claims, leave });
  }

  async function build(actor: string, request: PayrollRequest) {
    const configuration = await deps.configurations.requireAuthorized(actor, request.mandateId);
    const employee = configuration.view.employee;
    const recipients = Object.fromEntries(configuration.view.statutoryRules.map((rule) => [rule.body, rule.recipient])) as StatutoryRecipientConfig;
    const period = await readPeriod(configuration.view.mandateId, employee);
    const problem = periodProblem(period, request.gross);
    if (problem) throw new ServerError('invalid_request', 400, problem);

    const input = toInput(request, period);
    const source = computeStatutory(input);
    const rate = await deps.rates();
    return { breakdown: {
      ...quotePayrollSplit(source, rate, (deps.now ?? Date.now)()),
      employee,
      recipients,
    }, configuration, period, input, source };
  }

  async function assertAffordable(input: {
    mandateId: ObjectId;
    maxPerRun: string;
    spend: bigint;
  }): Promise<void> {
    const live = deps.budget ? await deps.budget.read(input.mandateId) : null;
    const maxPerRun = live ? live.maxPerRun : BigInt(input.maxPerRun);

    if (maxPerRun > 0n && input.spend > maxPerRun) {
      throw new ServerError(
        'invalid_request',
        400,
        `This run moves ${usdc(input.spend)} and the mandate allows ${usdc(maxPerRun)} in one run. ` +
          `That limit was fixed when the mandate was created and cannot be raised.`,
      );
    }

    if (live && input.spend > live.spendable) {
      throw new ServerError(
        'invalid_request',
        400,
        `This run moves ${usdc(input.spend)} and the mandate has ${usdc(live.spendable)} left. ` +
          `Nothing can be added to it, so pay a smaller wage or create a new mandate.`,
      );
    }
  }

  /**
   * Marks the overtime this run paid.
   *
   * The run is already recorded as paid by the time this runs, because the
   * digest is the truth about where the money went and it has to survive
   * whatever happens next. A claim left approved after its wage has reached
   * the worker is paid a second time on the next run, so a failure here is
   * raised rather than swallowed.
   *
   * It is raised as `payment_submission_uncertain` because that is the one
   * code the payroll screen renders as "do not run it again until you have
   * checked". Every other code renders as "Nothing was paid", and the money
   * has already gone.
   */
  async function settle(input: {
    period: PayrollPeriod;
    employee: Address;
    runId: string;
    digest: string;
  }): Promise<void> {
    const { period, digest } = input;
    if (!deps.period || period.claimIds.length === 0) return;
    try {
      await deps.period.markOvertimePaid({
        employee: input.employee,
        claimIds: period.claimIds,
        runId: input.runId,
      });
    } catch (error) {
      throw new ServerError(
        'payment_submission_uncertain',
        500,
        `Payroll was paid on ${digest}, but the overtime it paid could not be marked paid. ` +
          `Clear those claims before running payroll again or they will be paid twice.`,
        { cause: error },
      );
    }
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

      const { breakdown, configuration, period, input, source } = await build(actor, request);
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

      /* Every floor is measured against the one gross the contract is handed,
         and gross is total wages payable. EPF's base is not: EPF Act 1991
         s.2(b) puts overtime outside wages, so enough overtime drops a lawful
         EPF contribution under a floor the same wage cleared without it. The
         quote would hide that — it tops a short leg up to the floor, which for
         EPF means contributing on overtime, the exact payment the Act excludes.
         SOCSO and EIS take overtime into their own base, so only EPF fails
         this way, and it fails on chain as abort 24. */
      const epfFloorBps = BigInt(
        configuration.view.statutoryRules.find((rule) => rule.body === 'epf')?.minBps ?? '0',
      );
      if (epfFloorBps > 0n && !clearsFloor(source, 'epf', epfFloorBps)) {
        throw new ServerError(
          'invalid_request',
          400,
          floorRefusal({ body: 'epf', minBps: epfFloorBps, statutory: input, split: source, period }),
        );
      }

      const amountFor = (body: StatutoryBody): string => {
        const found = breakdown.bodies.find((entry) => entry.body === body);
        if (!found) return '0';
        // The enforcement screen sends one base unit so the floor refuses it.
        return request.underpay === body ? '1' : found.total;
      };

      const statutoryAmounts = STATUTORY_BODIES.map(amountFor);
      await assertAffordable({
        mandateId: configuration.snapshot.mandateId,
        maxPerRun: configuration.snapshot.maxPerRun,
        /* What the contract totals: the worker's net plus every contribution.
           Read off the amounts actually being sent, so an underpaid body is
           counted at what it is sent rather than what it is owed. */
        spend: statutoryAmounts.reduce((total, amount) => total + BigInt(amount), BigInt(breakdown.net)),
      });

      /* Persisted before anything is signed. A run that vanishes because the
         process died mid-submission is worse than one recorded as failed. */
      const record = await deps.runs.create({
        mandateId: configuration.snapshot.mandateId,
        employee: breakdown.employee,
        breakdown,
      });

      const submission = await deps.chain.run({
        packageId: configuration.snapshot.packageId,
        payrollCapId: configuration.snapshot.capId,
        mandateId: configuration.snapshot.mandateId,
        capOwnerWallet: configuration.snapshot.capOwnerWallet,
        employee: breakdown.employee,
        gross: breakdown.gross,
        net: breakdown.net,
        statutoryAmounts,
        recordRefusal: request.underpay !== undefined,
      });

      /* A refusal is the contract deciding. It is recorded with its code and
         returned as a normal result, never thrown: the caller needs to render
         which rule spoke, and no retry is attempted because a duplicate payroll
         run is worse than a failed one. */
      if (submission.status === 'refused') {
        return deps.runs.markFailed(record.id, submission.abortCode, submission.digest);
      }

      const paid = await deps.runs.markPaid(record.id, submission.digest);
      await settle({
        period,
        employee: breakdown.employee,
        runId: record.id,
        digest: submission.digest,
      });
      return paid;
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
