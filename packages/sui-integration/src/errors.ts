import type { TreasuryError } from './types.js';

const ERROR_DEFINITIONS = {
  0: ['ZERO_BUDGET', 'The mandate budget must be greater than zero.'],
  1: ['INVALID_LIMIT', 'The claim limit must be greater than zero and no larger than the budget.'],
  2: ['EMPTY_ALLOWLIST', 'Add at least one approved recipient.'],
  3: ['WRONG_AGENT_CAP', 'This agent is not authorized for the selected mandate.'],
  4: ['ZERO_AMOUNT', 'The payment amount must be greater than zero.'],
  5: ['AMOUNT_ABOVE_LIMIT', "This claim exceeds the mandate's per-claim limit."],
  6: ['INSUFFICIENT_BUDGET', 'The mandate does not have enough remaining funds.'],
  7: ['RECIPIENT_NOT_APPROVED', 'This recipient is not approved by the mandate.'],
  8: ['MANDATE_EXPIRED', 'This mandate has expired.'],
  9: ['MANDATE_REVOKED', 'This mandate has been revoked.'],
  10: ['WRONG_ADMIN_CAP', 'This administrator is not authorized for the selected mandate.'],
  11: ['NO_FUNDS_TO_WITHDRAW', 'The mandate has no remaining funds to withdraw.'],
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
