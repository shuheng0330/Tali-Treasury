import type {
  Address,
  Amount,
  LeaveRequest,
  OvertimeClaim,
  StatutoryBody,
  StatutoryBodyAmount,
  StatutorySplit,
} from '@tali/shared';
import {
  STATUTORY_BODIES,
  approvedLeaveDeduction,
  convertMyrToUsdc,
  pendingOvertimePay,
} from '@tali/shared';

export type ApprovalItem =
  | { kind: 'overtime'; claim: OvertimeClaim }
  | { kind: 'leave'; request: LeaveRequest };

/** Rejection is a human saying no, and it always says why. Approval need not. */
export type ReviewAction = 'approve' | 'reject';

export function itemId(item: ApprovalItem): string {
  return item.kind === 'overtime' ? item.claim.id : item.request.id;
}

export function itemEmployee(item: ApprovalItem): Address {
  return item.kind === 'overtime' ? item.claim.employee : item.request.employee;
}

export function submittedAtMs(item: ApprovalItem): number {
  return item.kind === 'overtime' ? item.claim.createdAtMs : item.request.createdAtMs;
}

/** Oldest first: whoever has waited longest is decided first. */
export function queueOrder(items: readonly ApprovalItem[]): ApprovalItem[] {
  return [...items].sort((a, b) => submittedAtMs(a) - submittedAtMs(b));
}

/** What approving moves gross by, in MYR base units. Negative for unpaid leave. */
export function grossEffect(item: ApprovalItem): string {
  return item.kind === 'overtime'
    ? item.claim.pay
    : (-BigInt(item.request.deduction)).toString();
}

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** One employee's standing position for the period the next run will pay. */
export interface WageBasis {
  /** The monthly wage of record, in MYR base units. */
  monthlyWage: Amount;
  /** Approved unpaid leave already taken off the period. */
  unpaidLeave: Amount;
  /** Approved overtime that no run has paid yet. */
  overtime: Amount;
}

export function wageBasis(
  employee: Address,
  claims: readonly OvertimeClaim[],
  requests: readonly LeaveRequest[],
): WageBasis {
  const theirClaims = claims.filter((claim) => sameAddress(claim.employee, employee));
  const theirLeave = requests.filter((request) => sameAddress(request.employee, employee));

  /* Every record carries the wage it was computed against, and a contract can
     move between them. The newest is the one describing the period being
     decided now. */
  const wages = [
    ...theirClaims.map((claim) => ({ at: claim.createdAtMs, wage: claim.monthlyWage })),
    ...theirLeave.map((request) => ({ at: request.createdAtMs, wage: request.monthlyWage })),
  ].sort((a, b) => b.at - a.at);

  return {
    monthlyWage: wages[0]?.wage ?? '0',
    unpaidLeave: approvedLeaveDeduction(theirLeave),
    overtime: pendingOvertimePay(theirClaims),
  };
}

/**
 * The wage EPF is measured against.
 *
 * Unpaid leave is wages not payable, so it comes off every base alike. Overtime
 * is outside EPF wages entirely — EPF Act 1991 s.2(b) — and never enters this.
 */
export function epfBase(basis: WageBasis): Amount {
  const payable = BigInt(basis.monthlyWage) - BigInt(basis.unpaidLeave);
  return (payable > 0n ? payable : 0n).toString();
}

/** Total wages payable, which is the single gross every floor is measured against. */
export function grossOf(basis: WageBasis): Amount {
  return (BigInt(epfBase(basis)) + BigInt(basis.overtime)).toString();
}

export function basisAfter(basis: WageBasis, item: ApprovalItem): WageBasis {
  if (item.kind === 'overtime') {
    return {
      ...basis,
      overtime: (BigInt(basis.overtime) + BigInt(item.claim.pay)).toString(),
    };
  }

  return {
    ...basis,
    unpaidLeave: (BigInt(basis.unpaidLeave) + BigInt(item.request.deduction)).toString(),
  };
}

/**
 * One split out of two, each computed on the base its own bodies belong to.
 *
 * The three bodies do not share a wage base and the preview endpoint answers
 * for one wage at a time. Asking it for the EPF base, asking again for total
 * wages payable, and taking every leg from the call that measured it correctly
 * reproduces an overtime-aware calculation exactly — which is what the test
 * beside this file asserts against `computeStatutory` itself, rather than
 * keeping a second copy of the arithmetic in the browser.
 */
export function composeSplit(
  epfSide: StatutorySplit,
  wageSide: StatutorySplit,
): StatutorySplit | null {
  const gross = BigInt(wageSide.gross);
  const base = BigInt(epfSide.gross);
  if (gross < base) return null;

  const bodies: StatutoryBodyAmount[] = [];
  for (const body of STATUTORY_BODIES) {
    const side = body === 'epf' ? epfSide : wageSide;
    const amount = side.bodies.find((entry) => entry.body === body);
    if (!amount) return null;
    bodies.push({ ...amount, base: amount.base ?? side.gross });
  }

  const employeeSide = bodies.reduce((total, entry) => total + BigInt(entry.employee), 0n);
  const employerSide = bodies.reduce((total, entry) => total + BigInt(entry.employer), 0n);

  return {
    gross: wageSide.gross,
    overtime: (gross - base).toString(),
    net: (gross - employeeSide).toString(),
    employerCost: (gross + employerSide).toString(),
    bodies,
  };
}

export interface MandateFloor {
  body: StatutoryBody;
  /** Minimum share of the basis this body must receive, in basis points. */
  minBps: string;
  /** Wage ceiling the floor is measured against. Zero means the whole gross. */
  wageCap: Amount;
}

/** What the deployed payroll mandate will and will not pay for. */
export interface MandateBudget {
  mandateId: string;
  /** Budget less what open salary streams reserve, in USDC base units. */
  spendable: Amount;
  maxPerRun: Amount;
  floors: MandateFloor[];
  revoked: boolean;
  expiryMs: number;
  fetchedAtMs: number;
}

export interface FloorTest {
  body: StatutoryBody;
  minBps: string;
  /** What the body receives, in MYR base units. */
  total: Amount;
  /** The smallest total this gross accepts. */
  required: Amount;
  clears: boolean;
  /** The share the contribution actually is of gross, in basis points. */
  actualBps: number;
}

/**
 * Whether a body still clears its mandate floor, by the contract's own test:
 * `amount * 10,000 >= basis * min_bps`.
 *
 * Only EPF is asked. Its floor carries no wage cap, so the ratio holds in
 * ringgit exactly as it does in the USDC the contract compares; SOCSO and EIS
 * are measured against a capped basis in the mandate's own units, and their
 * contributions are computed on that same capped wage, so they clear by
 * construction and a ringgit test of them would only introduce a rounding
 * argument.
 */
export function testFloor(split: StatutorySplit, floor: MandateFloor): FloorTest | null {
  const amount = split.bodies.find((entry) => entry.body === floor.body);
  if (!amount) return null;

  const minBps = BigInt(floor.minBps);
  const gross = BigInt(split.gross);
  const total = BigInt(amount.total);

  return {
    body: floor.body,
    minBps: floor.minBps,
    total: amount.total,
    required: ((gross * minBps + 9_999n) / 10_000n).toString(),
    clears: total * 10_000n >= gross * minBps,
    actualBps: gross > 0n ? Number((total * 10_000n) / gross) : 0,
  };
}

/**
 * The largest overtime this wage can carry before `body` drops under its floor.
 *
 * `total / (base + overtime) >= minBps / 10,000`, solved for overtime. EPF is
 * the only body it binds on, because its base does not grow with overtime while
 * the gross the floor is measured against does.
 */
export function overtimeHeadroom(
  split: StatutorySplit,
  floor: MandateFloor,
): Amount | null {
  const amount = split.bodies.find((entry) => entry.body === floor.body);
  if (!amount?.base) return null;

  const minBps = BigInt(floor.minBps);
  if (minBps <= 0n) return null;

  const ceiling = (BigInt(amount.total) * 10_000n) / minBps;
  const base = BigInt(amount.base);
  return (ceiling > base ? ceiling - base : 0n).toString();
}

export interface MandateSpend {
  /** What the run would move, converted at the quoted rate. USDC base units. */
  cost: Amount;
  spendable: Amount;
  maxPerRun: Amount;
  withinBudget: boolean;
  withinPerRun: boolean;
  /** What the mandate would hold afterwards, or null when it cannot pay. */
  remaining: Amount | null;
}

/**
 * What the mandate is asked for, in the units it holds.
 *
 * Employer cost rather than gross: the contract moves the net wage and every
 * statutory total out of the same budget, and those sum to gross plus the
 * employer's own contributions.
 */
export function projectedSpend(
  split: StatutorySplit,
  mandate: MandateBudget,
  myrPerUsd: string,
): MandateSpend | null {
  let cost: bigint;
  try {
    cost = BigInt(convertMyrToUsdc(split.employerCost, myrPerUsd));
  } catch {
    return null;
  }

  const spendable = BigInt(mandate.spendable);
  const withinBudget = cost <= spendable;

  return {
    cost: cost.toString(),
    spendable: mandate.spendable,
    maxPerRun: mandate.maxPerRun,
    withinBudget,
    withinPerRun: cost <= BigInt(mandate.maxPerRun),
    remaining: withinBudget ? (spendable - cost).toString() : null,
  };
}

/** Everything the approver is owed before the click. */
export interface Commitment {
  before: StatutorySplit;
  after: StatutorySplit;
  /** What approving moves gross by, in MYR base units. Signed. */
  grossChange: string;
  epfBefore: FloorTest | null;
  epfAfter: FloorTest | null;
  /** The most overtime this wage carries at the EPF floor. */
  epfCeiling: Amount | null;
  /** Overtime the wage would still have to spare afterwards. */
  epfSpare: Amount | null;
  spendBefore: MandateSpend | null;
  spendAfter: MandateSpend | null;
  /** The rate the USDC figures were projected at, when there is one. */
  myrPerUsd: string | null;
}

export function commitment(input: {
  before: StatutorySplit;
  after: StatutorySplit;
  mandate: MandateBudget | null;
  myrPerUsd: string | null;
}): Commitment {
  const epf = input.mandate?.floors.find((floor) => floor.body === 'epf') ?? null;
  const ceiling = epf ? overtimeHeadroom(input.after, epf) : null;
  const overtimeAfter = BigInt(input.after.overtime ?? '0');

  return {
    before: input.before,
    after: input.after,
    grossChange: (BigInt(input.after.gross) - BigInt(input.before.gross)).toString(),
    epfBefore: epf ? testFloor(input.before, epf) : null,
    epfAfter: epf ? testFloor(input.after, epf) : null,
    epfCeiling: ceiling,
    epfSpare:
      ceiling === null
        ? null
        : (BigInt(ceiling) > overtimeAfter ? BigInt(ceiling) - overtimeAfter : 0n).toString(),
    spendBefore:
      input.mandate && input.myrPerUsd
        ? projectedSpend(input.before, input.mandate, input.myrPerUsd)
        : null,
    spendAfter:
      input.mandate && input.myrPerUsd
        ? projectedSpend(input.after, input.mandate, input.myrPerUsd)
        : null,
    myrPerUsd: input.myrPerUsd,
  };
}
