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
