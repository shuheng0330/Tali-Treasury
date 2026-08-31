/**
 * The seven asserts inside `treasury::spend`, in the order the contract
 * evaluates them, transcribed from
 * contracts/tali_treasury/sources/tali_treasury.move lines 116-131.
 *
 * Order matters and is load-bearing: a claim that breaks two rules aborts on
 * whichever comes first here, which is why the safety test can only ever show
 * you the earliest failure.
 */
export interface Check {
  code: number;
  key: string;
  /** What the assert is actually testing, in the treasurer's words. */
  label: string;
}

export const SPEND_CHECKS: readonly Check[] = [
  { code: 3, key: 'E_WRONG_AGENT_CAP', label: 'The caller holds this mandate’s agent capability' },
  { code: 9, key: 'E_MANDATE_REVOKED', label: 'The mandate has not been revoked' },
  { code: 4, key: 'E_ZERO_AMOUNT', label: 'The amount is greater than zero' },
  { code: 5, key: 'E_AMOUNT_ABOVE_LIMIT', label: 'The amount is within the per-claim cap' },
  { code: 6, key: 'E_INSUFFICIENT_BUDGET', label: 'The mandate still holds that much budget' },
  { code: 7, key: 'E_RECIPIENT_NOT_APPROVED', label: 'The recipient is on the allowlist' },
  { code: 8, key: 'E_MANDATE_EXPIRED', label: 'The mandate has not expired' },
];
