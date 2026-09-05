import type { Address, Amount, LeaveRequest, ObjectId, OvertimeClaim } from '@tali/shared';
import {
  approvedLeaveDeduction,
  fromCentihours,
  pendingOvertimePay,
  toCentihours,
  toDisplay,
} from '@tali/shared';

/**
 * What payroll needs from the overtime and leave stores.
 *
 * Narrower than the service that satisfies it, and stated here so the two can
 * be built at the same time: payroll reads approved work and marks it paid, and
 * knows nothing about submitting a claim or reviewing one.
 */
export interface PayrollPeriodSource {
  listOvertime(input: {
    mandateId: ObjectId;
    employee: Address;
  }): Promise<readonly OvertimeClaim[]>;
  listLeave(input: { mandateId: ObjectId; employee: Address }): Promise<readonly LeaveRequest[]>;
  /**
   * Stamps the run onto the overtime it paid. Marking a claim the same run
   * already paid must change nothing.
   *
   * The ids say which claims went into this run's gross; `employee` is here
   * because a store that settles a whole worker at once can do so without
   * payroll first having to know how it indexes them.
   */
  markOvertimePaid(input: {
    employee: Address;
    claimIds: readonly string[];
    runId: string;
  }): Promise<void>;
}

/** The approved work one payroll run carries on top of the base wage. */
export interface PayrollPeriod {
  /** Approved overtime not yet paid, in MYR base units. */
  overtime: Amount;
  /** Approved unpaid leave, in MYR base units. */
  unpaidLeave: Amount;
  /** The hours behind `overtime`. */
  hours: string;
  /** The claims this run pays, and has to mark paid once it has. */
  claimIds: string[];
}

export const EMPTY_PERIOD: PayrollPeriod = {
  overtime: '0',
  unpaidLeave: '0',
  hours: '0',
  claimIds: [],
};

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * The overtime this run owes.
 *
 * Status excludes what has already been paid, and the run id excludes it a
 * second time. A marking that half-failed leaves a claim stamped with a run but
 * still reading as approved, and paying that claim again is the one mistake in
 * this flow that costs the treasury money twice over.
 */
function payable(
  claims: readonly OvertimeClaim[],
  employee: Address,
  mandateId: ObjectId,
): OvertimeClaim[] {
  return claims.filter(
    (claim) =>
      claim.status === 'approved' &&
      claim.runId === null &&
      sameAddress(claim.employee, employee) &&
      /* A claim raised before the payroll was registered carries no mandate.
         It is still this employee's overtime and it is still owed. */
      (claim.mandateId === null || sameAddress(claim.mandateId, mandateId)),
  );
}

export function assemblePeriod(input: {
  mandateId: ObjectId;
  employee: Address;
  claims: readonly OvertimeClaim[];
  leave: readonly LeaveRequest[];
}): PayrollPeriod {
  const claims = payable(input.claims, input.employee, input.mandateId);
  const leave = input.leave.filter((request) => sameAddress(request.employee, input.employee));
  const centihours = claims.reduce((total, claim) => total + toCentihours(claim.hours), 0n);

  return {
    overtime: pendingOvertimePay(claims),
    unpaidLeave: approvedLeaveDeduction(leave),
    hours: fromCentihours(centihours),
    claimIds: claims.map((claim) => claim.id),
  };
}

/**
 * Why this period cannot be paid against this wage, or null.
 *
 * `computeStatutory` throws on both of these, and a thrown Error reaches the
 * caller as an unexplained 500. They are ordinary data problems — leave records
 * that outran the wage they come off — so they get an answer that says so.
 */
export function periodProblem(period: PayrollPeriod, baseWage: Amount): string | null {
  const wage = BigInt(baseWage);
  const unpaid = BigInt(period.unpaidLeave);

  if (unpaid > wage) {
    return (
      `Approved unpaid leave comes to RM ${toDisplay(period.unpaidLeave)}, more than the ` +
      `RM ${toDisplay(baseWage)} wage it comes off. Correct the leave records before running payroll.`
    );
  }

  if (wage - unpaid + BigInt(period.overtime) <= 0n) {
    return (
      `Unpaid leave takes this month's wage to nothing, so there is no payment to make. ` +
      `Correct the leave records before running payroll.`
    );
  }

  return null;
}
