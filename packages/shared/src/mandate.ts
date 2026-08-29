import type { MandateState } from '@tali/treasury-sui';
import type { Address, Amount, ObjectId } from './claims.js';
import { fromBigInt } from './money.js';

export type MandateStatus = 'active' | 'expired' | 'revoked';

/** JSON-safe projection of the on-chain MandateState, which uses bigint. */
export interface MandateView {
  id: ObjectId;
  coinType: string;
  initialBudget: Amount;
  remainingBudget: Amount;
  amountSpent: Amount;
  maxPerClaim: Amount;
  expiryMs: number;
  revoked: boolean;
  approvedRecipients: Address[];
  fetchedAtMs: number;
}

export function toMandateView(state: MandateState, fetchedAtMs = Date.now()): MandateView {
  return {
    id: state.id,
    coinType: state.coinType,
    initialBudget: fromBigInt(state.initialBudget),
    remainingBudget: fromBigInt(state.remainingBudget),
    amountSpent: fromBigInt(state.amountSpent),
    maxPerClaim: fromBigInt(state.maxPerClaim),
    expiryMs: Number(state.expiryMs),
    revoked: state.revoked,
    approvedRecipients: state.approvedRecipients,
    fetchedAtMs,
  };
}

export function mandateStatus(mandate: MandateView, nowMs = Date.now()): MandateStatus {
  if (mandate.revoked) return 'revoked';
  if (nowMs >= mandate.expiryMs) return 'expired';
  return 'active';
}

export function isAllowedRecipient(mandate: MandateView, recipient: Address): boolean {
  const target = recipient.toLowerCase();
  return mandate.approvedRecipients.some((address) => address.toLowerCase() === target);
}
