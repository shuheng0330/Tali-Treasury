import type { Amount, StatutoryBodyAmount, StatutorySplit } from '@tali/shared';

export interface StatutoryInput {
  /** Monthly gross wage in base units, six decimals. */
  gross: Amount;
  age: number;
  citizenship: 'local' | 'foreign';
}

const RINGGIT = 1_000_000n;

/** Third Schedule band widths, and the wage at which the width changes. */
const NARROW_BAND = 20n * RINGGIT;
const WIDE_BAND = 100n * RINGGIT;
const BAND_STEP_WAGE = 5_000n * RINGGIT;

/** Above this the schedule stops and exact percentages apply. */
const SCHEDULE_CEILING = 20_000n * RINGGIT;

/** SOCSO and EIS stop growing here. */
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
): StatutoryBodyAmount {
  return {
    body: name,
    employee: employee.toString(),
    employer: employer.toString(),
    total: (employee + employer).toString(),
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
 */
export function computeStatutory(input: StatutoryInput): StatutorySplit {
  const gross = BigInt(input.gross);
  if (gross < 0n) {
    throw new Error('gross wage cannot be negative');
  }

  const rates = epfRatesBps({ gross, age: input.age, citizenship: input.citizenship });
  const band = epfWageBand(gross);
  const epfEmployee = toWholeRinggit(percent(band, rates.employee));
  const epfEmployer = toWholeRinggit(percent(band, rates.employer));

  const capped = gross < CONTRIBUTION_CAP ? gross : CONTRIBUTION_CAP;
  const socsoEmployee = percent(capped, 50n);
  const socsoEmployer = percent(capped, 175n);

  /* EIS covers loss of employment, which does not apply once someone is past
     retirement age, so both sides fall away rather than only the employee's. */
  const eisExempt = input.age >= SENIOR_AGE;
  const eisEmployee = eisExempt ? 0n : percent(capped, 20n);
  const eisEmployer = eisExempt ? 0n : percent(capped, 20n);

  const bodies: StatutoryBodyAmount[] = [
    body('epf', epfEmployee, epfEmployer),
    body('socso', socsoEmployee, socsoEmployer),
    body('eis', eisEmployee, eisEmployer),
  ];

  const employeeSide = epfEmployee + socsoEmployee + eisEmployee;
  const employerSide = epfEmployer + socsoEmployer + eisEmployer;

  return {
    gross: gross.toString(),
    net: (gross - employeeSide).toString(),
    employerCost: (gross + employerSide).toString(),
    bodies,
  };
}
