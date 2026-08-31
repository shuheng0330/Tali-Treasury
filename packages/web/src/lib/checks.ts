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
  { code: TREASURY_ABORT_CODE.WRONG_AGENT_CAP, key: treasuryErrorFromCode(TREASURY_ABORT_CODE.WRONG_AGENT_CAP).key, label: 'The caller holds this mandate’s agent capability' },
  { code: TREASURY_ABORT_CODE.MANDATE_REVOKED, key: treasuryErrorFromCode(TREASURY_ABORT_CODE.MANDATE_REVOKED).key, label: 'The mandate has not been revoked' },
  { code: TREASURY_ABORT_CODE.ZERO_AMOUNT, key: treasuryErrorFromCode(TREASURY_ABORT_CODE.ZERO_AMOUNT).key, label: 'The amount is greater than zero' },
  { code: TREASURY_ABORT_CODE.AMOUNT_ABOVE_LIMIT, key: treasuryErrorFromCode(TREASURY_ABORT_CODE.AMOUNT_ABOVE_LIMIT).key, label: 'The amount is within the per-claim cap' },
  { code: TREASURY_ABORT_CODE.INSUFFICIENT_BUDGET, key: treasuryErrorFromCode(TREASURY_ABORT_CODE.INSUFFICIENT_BUDGET).key, label: 'The mandate still holds that much budget' },
  { code: TREASURY_ABORT_CODE.RECIPIENT_NOT_APPROVED, key: treasuryErrorFromCode(TREASURY_ABORT_CODE.RECIPIENT_NOT_APPROVED).key, label: 'The recipient is on the allowlist' },
  { code: TREASURY_ABORT_CODE.MANDATE_EXPIRED, key: treasuryErrorFromCode(TREASURY_ABORT_CODE.MANDATE_EXPIRED).key, label: 'The mandate has not expired' },
];
import { TREASURY_ABORT_CODE, treasuryErrorFromCode } from '@tali/treasury-sui';
