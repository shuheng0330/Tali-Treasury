import type { Amount, StatutoryBodyAmount, StatutorySplit } from '@tali/shared';

export interface StatutoryInput {
  /** Monthly base wage in base units, six decimals. */
  gross: Amount;
  age: number;
  citizenship: 'local' | 'foreign';
  /**
   * Approved overtime for the period.
   *
   * EPF Act 1991 s.2(b) excludes overtime payment from wages, and KWSP says so
   * directly: "Overtime payments are not subject to EPF contribution." SOCSO
   * (Act 4 s.2(24)) and EIS (Act 800 s.3) both define wages to include "any
   * payment in respect of leave, holidays, overtime, and extra work on
   * holidays". So this raises two of the three bases and not the third.
   */
  overtime?: Amount;
  /**
   * Unpaid leave taken in the period.
   *
   * Wages not payable are not wages under any of the three definitions, so this
   * comes off every base alike, before EPF's band lookup and before the SOCSO
   * and EIS ceiling.
   */
  unpaidLeave?: Amount;
}

const RINGGIT = 1_000_000n;

/** Third Schedule band widths, and the wage at which the width changes. */
const NARROW_BAND = 20n * RINGGIT;
const WIDE_BAND = 100n * RINGGIT;
const BAND_STEP_WAGE = 5_000n * RINGGIT;

/** Above this the schedule stops and exact percentages apply. */
const SCHEDULE_CEILING = 20_000n * RINGGIT;

/**
 * SOCSO and EIS stop growing here, since 1 October 2024.
 *
 * A deeming provision rather than a cap applied afterwards: Act 4 s.5(2) says
 * wages above it "shall for the purposes of this Act be deemed to be" this
 * figure. Overtime therefore counts toward reaching it.
 */
const CONTRIBUTION_CAP = 6_000n * RINGGIT;

const SENIOR_AGE = 60;

function ceilDiv(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}

/** Contributions are stated in whole ringgit, always rounded up. */
function toWholeRinggit(value: bigint): bigint {
  return ceilDiv(value, RINGGIT) * RINGGIT;
}

function percent(base: bigint, bps: bigint): bigint {
  return (base * bps) / 10_000n;
}

/**
 * A percentage that never lands under the rate it states.
 *
 * The mandate's floor demands at least this many basis points of the wage, and
 * a truncating division delivers one base unit less whenever the wage is not a
 * whole multiple of the divisor. Whole-ringgit wages always are; overtime pay,
 * rounded up to the base unit, almost never is. One ten-thousandth of a sen
 * short is still short, and the contract counts.
 */
function ceilPercent(base: bigint, bps: bigint): bigint {
  return ceilDiv(base * bps, 10_000n);
}

function atLeastZero(value: bigint): bigint {
  return value > 0n ? value : 0n;
}

/**
 * The wage band a salary falls into, returned as its ceiling.
 *
 * The Third Schedule does not compute a percentage of the actual wage: it
 * groups wages into bands and states a fixed ringgit figure for each. Bands are
 * RM20 wide below RM5,000 and RM100 wide from there to RM20,000.
 */
export function epfWageBand(gross: bigint): bigint {
  if (gross > SCHEDULE_CEILING) return gross;
  const width = gross <= BAND_STEP_WAGE ? NARROW_BAND : WIDE_BAND;
  return ceilDiv(gross, width) * width;
}

function epfRatesBps(input: {
  gross: bigint;
  age: number;
  citizenship: 'local' | 'foreign';
}): { employee: bigint; employer: bigint } {
  if (input.citizenship === 'foreign') {
    return { employee: 200n, employer: 200n };
  }
  if (input.age >= SENIOR_AGE) {
    return { employee: 0n, employer: 400n };
  }
  return {
    employee: 1100n,
    employer: input.gross <= BAND_STEP_WAGE ? 1300n : 1200n,
  };
}

function body(
  name: StatutoryBodyAmount['body'],
  employee: bigint,
  employer: bigint,
  base: bigint,
): StatutoryBodyAmount {
  return {
    body: name,
    employee: employee.toString(),
    employer: employer.toString(),
    total: (employee + employer).toString(),
    base: base.toString(),
  };
}

/**
 * The statutory split for one month of wages.
 *
 * Pure arithmetic on base units. No addresses, no I/O, no floating point: a
 * rounding error here is money that never reaches someone's retirement account.
 *
 * EPF follows the Third Schedule bands. SOCSO and EIS are applied as
 * percentages of the wage capped at RM6,000 rather than from their own
 * schedules, which is a documented simplification — their tables step in small
 * increments and land within a ringgit of this.
 *
 * The three bases are computed separately because the law does not share one.
 * Overtime is outside EPF wages and inside SOCSO and EIS wages, so a month with
 * overtime that measured all three against one number would over-contribute EPF
 * or under-contribute the other two, and under-contributing is the precise
 * failure this product exists to prevent.
 */
export function computeStatutory(input: StatutoryInput): StatutorySplit {
  const baseWage = BigInt(input.gross);
  const overtime = BigInt(input.overtime ?? '0');
  const unpaidLeave = BigInt(input.unpaidLeave ?? '0');

  if (baseWage < 0n) throw new Error('gross wage cannot be negative');
  if (overtime < 0n) throw new Error('overtime cannot be negative');
  if (unpaidLeave < 0n) throw new Error('unpaid leave cannot be negative');
  if (unpaidLeave > baseWage) {
    throw new Error('unpaid leave cannot exceed the base wage');
  }

  const paidWage = baseWage - unpaidLeave;
  const gross = paidWage + overtime;

  const epfBase = paidWage;
  const insuredWage = gross < CONTRIBUTION_CAP ? gross : CONTRIBUTION_CAP;

  const rates = epfRatesBps({ gross: epfBase, age: input.age, citizenship: input.citizenship });
  const band = epfWageBand(epfBase);
  const epfEmployee = atLeastZero(toWholeRinggit(percent(band, rates.employee)));
  const epfEmployer = atLeastZero(toWholeRinggit(percent(band, rates.employer)));

  const socsoEmployee = ceilPercent(insuredWage, 50n);
  const socsoEmployer = ceilPercent(insuredWage, 175n);

  /* EIS covers loss of employment, which does not apply once someone is past
     retirement age, so both sides fall away rather than only the employee's. */
  const eisExempt = input.age >= SENIOR_AGE;
  const eisEmployee = eisExempt ? 0n : ceilPercent(insuredWage, 20n);
  const eisEmployer = eisExempt ? 0n : ceilPercent(insuredWage, 20n);

  const bodies: StatutoryBodyAmount[] = [
    body('epf', epfEmployee, epfEmployer, epfBase),
    body('socso', socsoEmployee, socsoEmployer, insuredWage),
    body('eis', eisEmployee, eisEmployer, insuredWage),
  ];

  const employeeSide = epfEmployee + socsoEmployee + eisEmployee;
  const employerSide = epfEmployer + socsoEmployer + eisEmployer;

  return {
    gross: gross.toString(),
    baseWage: baseWage.toString(),
    overtime: overtime.toString(),
    unpaidLeave: unpaidLeave.toString(),
    net: (gross - employeeSide).toString(),
    employerCost: (gross + employerSide).toString(),
    bodies,
  };
}

/**
 * Whether a split still clears a mandate floor once overtime is in it.
 *
 * The contract measures every floor against the one `gross` it is handed, so a
 * month where overtime raises gross while EPF's base stays behind can drop EPF
 * below a floor that a month without overtime cleared comfortably. Better to
 * say so before the employer approves the claim than to abort on chain after.
 */
export function clearsFloor(
  split: StatutorySplit,
  body: StatutoryBodyAmount['body'],
  minBps: bigint,
  /**
   * The mandate's wage cap for this body. Zero means uncapped, as on chain.
   *
   * Takes an Amount as readily as a bigint: every other money value in this
   * codebase travels as a decimal string, and a caller reading the cap off a
   * mandate view has a string in hand.
   */
  wageCap: bigint | Amount = 0n,
): boolean {
  const amount = split.bodies.find((entry) => entry.body === body);
  if (!amount) return false;
  const basis = floorBasis(BigInt(split.gross), BigInt(wageCap));
  return BigInt(amount.total) * 10_000n >= basis * minBps;
}

/** `floor_basis` from payroll.move, so this answers what the chain would. */
function floorBasis(gross: bigint, cap: bigint): bigint {
  return cap === 0n || gross < cap ? gross : cap;
}

/** The largest overtime this wage can carry before `body` drops under its floor. */
export function overtimeHeadroom(
  input: StatutoryInput,
  body: StatutoryBodyAmount['body'],
  minBps: bigint,
): Amount {
  const withoutOvertime = computeStatutory({ ...input, overtime: '0' });
  const amount = withoutOvertime.bodies.find((entry) => entry.body === body);
  if (!amount) return '0';
  if (minBps <= 0n) return withoutOvertime.gross;

  /* total / (paid + overtime) >= minBps / 10000, solved for overtime. EPF is
     the only body this binds on, because its base does not grow with overtime
     while the gross the floor is measured against does. */
  const ceiling = (BigInt(amount.total) * 10_000n) / minBps;
  const paid = BigInt(withoutOvertime.gross);
  return atLeastZero(ceiling - paid).toString();
}
