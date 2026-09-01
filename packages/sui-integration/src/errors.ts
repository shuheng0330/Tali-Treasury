import type { TreasuryError } from './types.js';

export const TREASURY_ABORT_CODE = {
  ZERO_BUDGET: 0,
  INVALID_LIMIT: 1,
  EMPTY_ALLOWLIST: 2,
  WRONG_AGENT_CAP: 3,
  ZERO_AMOUNT: 4,
  AMOUNT_ABOVE_LIMIT: 5,
  INSUFFICIENT_BUDGET: 6,
  RECIPIENT_NOT_APPROVED: 7,
  MANDATE_EXPIRED: 8,
  MANDATE_REVOKED: 9,
  WRONG_ADMIN_CAP: 10,
  NO_FUNDS_TO_WITHDRAW: 11,
} as const;

/**
 * The payroll module numbers its aborts from 20 so that a single lookup can
 * cover both modules. Sui reports the code without telling us which module
 * raised it, and overlapping numbers would silently mislabel a refusal.
 */
export const PAYROLL_ABORT_CODE = {
  WRONG_PAYROLL_CAP: 20,
  PAYROLL_REVOKED: 21,
  LENGTH_MISMATCH: 22,
  PAYROLL_ZERO_AMOUNT: 23,
  STATUTORY_SHORT: 24,
  ABOVE_RUN_LIMIT: 25,
  PAYROLL_INSUFFICIENT: 26,
  PAYROLL_EXPIRED: 27,
  NOTHING_ACCRUED: 28,
  WRONG_STREAM_MANDATE: 29,
  INVALID_STREAM_PERIOD: 30,
  EMPLOYEE_NOT_APPROVED: 31,
  NET_ABOVE_GROSS: 32,
  INVALID_PAYROLL_TERMS: 33,
  NO_PAYROLL_FUNDS: 34,
} as const;

const ERROR_DEFINITIONS = {
  [TREASURY_ABORT_CODE.ZERO_BUDGET]: ['ZERO_BUDGET', 'The mandate budget must be greater than zero.'],
  [TREASURY_ABORT_CODE.INVALID_LIMIT]: ['INVALID_LIMIT', 'The claim limit must be greater than zero and no larger than the budget.'],
  [TREASURY_ABORT_CODE.EMPTY_ALLOWLIST]: ['EMPTY_ALLOWLIST', 'Add at least one approved recipient.'],
  [TREASURY_ABORT_CODE.WRONG_AGENT_CAP]: ['WRONG_AGENT_CAP', 'This agent is not authorized for the selected mandate.'],
  [TREASURY_ABORT_CODE.ZERO_AMOUNT]: ['ZERO_AMOUNT', 'The payment amount must be greater than zero.'],
  [TREASURY_ABORT_CODE.AMOUNT_ABOVE_LIMIT]: ['AMOUNT_ABOVE_LIMIT', "This claim exceeds the mandate's per-claim limit."],
  [TREASURY_ABORT_CODE.INSUFFICIENT_BUDGET]: ['INSUFFICIENT_BUDGET', 'The mandate does not have enough remaining funds.'],
  [TREASURY_ABORT_CODE.RECIPIENT_NOT_APPROVED]: ['RECIPIENT_NOT_APPROVED', 'This recipient is not approved by the mandate.'],
  [TREASURY_ABORT_CODE.MANDATE_EXPIRED]: ['MANDATE_EXPIRED', 'This mandate has expired.'],
  [TREASURY_ABORT_CODE.MANDATE_REVOKED]: ['MANDATE_REVOKED', 'This mandate has been revoked.'],
  [TREASURY_ABORT_CODE.WRONG_ADMIN_CAP]: ['WRONG_ADMIN_CAP', 'This administrator is not authorized for the selected mandate.'],
  [TREASURY_ABORT_CODE.NO_FUNDS_TO_WITHDRAW]: ['NO_FUNDS_TO_WITHDRAW', 'The mandate has no remaining funds to withdraw.'],
  [PAYROLL_ABORT_CODE.WRONG_PAYROLL_CAP]: ['WRONG_PAYROLL_CAP', 'This capability is not authorized for the selected payroll mandate.'],
  [PAYROLL_ABORT_CODE.PAYROLL_REVOKED]: ['PAYROLL_REVOKED', 'This payroll mandate has been revoked.'],
  [PAYROLL_ABORT_CODE.LENGTH_MISMATCH]: ['LENGTH_MISMATCH', 'The statutory amounts do not line up with the recipients this mandate was created with.'],
  [PAYROLL_ABORT_CODE.PAYROLL_ZERO_AMOUNT]: ['PAYROLL_ZERO_AMOUNT', 'Every amount in a payroll run must be greater than zero.'],
  [PAYROLL_ABORT_CODE.STATUTORY_SHORT]: ['STATUTORY_SHORT', 'A statutory contribution is below the minimum this mandate enforces. Nobody was paid.'],
  [PAYROLL_ABORT_CODE.ABOVE_RUN_LIMIT]: ['ABOVE_RUN_LIMIT', "This payroll run exceeds the mandate's per-run limit."],
  [PAYROLL_ABORT_CODE.PAYROLL_INSUFFICIENT]: ['PAYROLL_INSUFFICIENT', 'The payroll mandate does not have enough unreserved funds.'],
  [PAYROLL_ABORT_CODE.PAYROLL_EXPIRED]: ['PAYROLL_EXPIRED', 'This payroll mandate has expired.'],
  [PAYROLL_ABORT_CODE.NOTHING_ACCRUED]: ['NOTHING_ACCRUED', 'Nothing has accrued on this salary stream since the last withdrawal.'],
  [PAYROLL_ABORT_CODE.WRONG_STREAM_MANDATE]: ['WRONG_STREAM_MANDATE', 'This salary stream belongs to a different payroll mandate.'],
  [PAYROLL_ABORT_CODE.INVALID_STREAM_PERIOD]: ['INVALID_STREAM_PERIOD', 'A salary stream must end after it starts.'],
  [PAYROLL_ABORT_CODE.EMPLOYEE_NOT_APPROVED]: ['EMPLOYEE_NOT_APPROVED', 'This mandate is not allowed to pay that address.'],
  [PAYROLL_ABORT_CODE.NET_ABOVE_GROSS]: ['NET_ABOVE_GROSS', 'Take-home pay cannot be larger than the wage it comes from.'],
  [PAYROLL_ABORT_CODE.INVALID_PAYROLL_TERMS]: ['INVALID_PAYROLL_TERMS', 'These mandate terms would not enforce anything. Check the floors, the run limit and the staff list.'],
  [PAYROLL_ABORT_CODE.NO_PAYROLL_FUNDS]: ['NO_PAYROLL_FUNDS', 'Every remaining ringgit is already promised to an open salary stream.'],
} as const satisfies Record<number, readonly [string, string]>;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function treasuryErrorFromCode(code: number, rawMessage = ''): TreasuryError {
  const definition = ERROR_DEFINITIONS[code as keyof typeof ERROR_DEFINITIONS];
  if (!definition) {
    return {
      code,
      key: 'UNKNOWN_MOVE_ABORT',
      message: `The treasury contract rejected this transaction (code ${code}).`,
      retryable: false,
      rawMessage,
    };
  }

  return {
    code,
    key: definition[0],
    message: definition[1],
    retryable: false,
    rawMessage,
  };
}

export function parseTreasuryError(error: unknown): TreasuryError {
  const rawMessage = errorText(error);
  const codeMatch =
    rawMessage.match(/error_code["']?\s*[:=]\s*(\d+)/i) ??
    rawMessage.match(/MoveAbort[\s\S]*?\}\s*,\s*(\d+)\)/i) ??
    rawMessage.match(/\bcode\s+(\d+)\b/i);

  if (codeMatch?.[1]) {
    return treasuryErrorFromCode(Number(codeMatch[1]), rawMessage);
  }

  return {
    code: null,
    key: 'TRANSACTION_FAILED',
    message: 'The Sui transaction failed. Please try again or contact the treasurer.',
    retryable: true,
    rawMessage,
  };
}
