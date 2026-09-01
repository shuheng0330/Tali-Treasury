import type { SalaryStreamState } from '@tali/treasury-sui';
import type { Address, Amount, ObjectId } from './claims.js';
import { fromBigInt } from './money.js';

export type StatutoryBody = 'epf' | 'socso' | 'eis';

/**
 * Fixed order. The contract pairs `statutory_amounts[i]` with
 * `statutory_recipients[i]` by index, so a divergence here sends money to the
 * wrong body while every assert still passes.
 */
export const STATUTORY_BODIES: readonly StatutoryBody[] = ['epf', 'socso', 'eis'];

export const STATUTORY_BODY_LABEL: Record<StatutoryBody, string> = {
  epf: 'EPF',
  socso: 'SOCSO',
  eis: 'EIS',
};

export interface StatutoryBodyAmount {
  body: StatutoryBody;
  employee: Amount;
  employer: Amount;
  /** What the body receives on chain: employee plus employer. */
  total: Amount;
}

/** What the calculator returns. Pure arithmetic, no addresses. */
export interface StatutorySplit {
  gross: Amount;
  /** Gross minus the employee-side deductions. */
  net: Amount;
  /** Gross plus the employer-side contributions: what the treasury pays out. */
  employerCost: Amount;
  bodies: StatutoryBodyAmount[];
}

/** A split with recipients attached, ready to submit. */
export interface PayrollBreakdown extends StatutorySplit {
  employee: Address;
  recipients: Record<StatutoryBody, Address>;
}

export type PayrollRunStatus = 'pending' | 'paid' | 'failed';

export interface PayrollRunView {
  id: string;
  employee: Address;
  breakdown: PayrollBreakdown;
  status: PayrollRunStatus;
  digest: string | null;
  abortCode: number | null;
  createdAtMs: number;
}

export interface SalaryStreamView {
  id: ObjectId;
  mandateId: ObjectId;
  employee: Address;
  /** Total payable across the whole period. */
  totalAmount: Amount;
  startedAtMs: number;
  endsAtMs: number;
  withdrawn: Amount;
  /** Earned as of the read. */
  accrued: Amount;
  /** accrued minus withdrawn. */
  available: Amount;
}

export type WithdrawEarnedResult =
  | { ok: true; digest: string; amount: Amount }
  | { ok: false; abortCode: number; message: string };

/**
 * Accrual, as integer arithmetic on base units.
 *
 * Deliberately not a per-millisecond rate: a RM3,000 monthly salary is 1.157
 * base units per millisecond, which truncates to 1 and loses RM408 over the
 * month. Deriving from the total avoids that, and BigInt avoids the u64
 * overflow the same product hits on chain above roughly RM70,000.
 *
 * This must stay identical to `withdraw_earned` in the Move module. If the two
 * disagree, the interface offers an amount the contract refuses.
 */
export function accruedAt(
  stream: Pick<SalaryStreamView, 'totalAmount' | 'startedAtMs' | 'endsAtMs'>,
  nowMs: number,
): Amount {
  const duration = BigInt(stream.endsAtMs - stream.startedAtMs);
  if (duration <= 0n) return '0';

  const capped = Math.min(nowMs, stream.endsAtMs);
  const elapsed = BigInt(capped - stream.startedAtMs);
  if (elapsed <= 0n) return '0';

  return ((BigInt(stream.totalAmount) * elapsed) / duration).toString();
}

export function availableAt(
  stream: Pick<
    SalaryStreamView,
    'totalAmount' | 'startedAtMs' | 'endsAtMs' | 'withdrawn'
  >,
  nowMs: number,
): Amount {
  const earned = BigInt(accruedAt(stream, nowMs));
  const drawn = BigInt(stream.withdrawn);
  return earned > drawn ? (earned - drawn).toString() : '0';
}

/**
 * JSON-safe projection of the on-chain stream, with accrual resolved at a
 * single instant.
 *
 * `accrued` and `available` are read at `nowMs` and stale immediately. The
 * interface ticks them forward locally with the same formula rather than
 * re-reading the chain every frame.
 */
export function toSalaryStreamView(
  state: SalaryStreamState,
  nowMs = Date.now(),
): SalaryStreamView {
  const settled = {
    id: state.id,
    mandateId: state.mandateId,
    employee: state.employee,
    totalAmount: fromBigInt(state.totalAmount),
    startedAtMs: Number(state.startedAtMs),
    endsAtMs: Number(state.endsAtMs),
    withdrawn: fromBigInt(state.withdrawn),
  };

  return {
    ...settled,
    accrued: accruedAt(settled, nowMs),
    available: availableAt(settled, nowMs),
  };
}
