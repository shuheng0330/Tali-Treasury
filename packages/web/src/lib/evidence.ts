import { taliUsdcDemo } from '@tali/treasury-sui';

/**
 * Transactions actually executed against the deployed package on Sui testnet,
 * recorded in contracts/tali_treasury/USDC_SETUP.md. Every digest here resolves
 * in an explorer.
 *
 * Digests and the mandate id come from `taliUsdcDemo` so there is one source of
 * truth. The USDC amounts are 6 decimals, which is what `COIN_DECIMALS` already
 * assumes, so these figures need no special handling.
 */

export const LIVE_MANDATE_ID = taliUsdcDemo.mandateId;

export interface OnChainRun {
  kind: 'allowed' | 'refused';
  digest: string;
  headline: string;
  detail: string;
  abort: { code: number; key: string } | null;
}

export const ON_CHAIN_RUNS: readonly OnChainRun[] = [
  {
    kind: 'allowed',
    digest: taliUsdcDemo.firstPayment.transaction,
    headline: 'Paid 3 USDC to an approved member',
    detail: 'Inside the cap, inside the budget, recipient on the list. Emitted PaymentMade.',
    abort: null,
  },
  {
    kind: 'refused',
    digest: taliUsdcDemo.safetyTest.oversizedClaimTransaction,
    headline: 'Asked for 15 USDC against a 5 USDC cap',
    detail: 'The agent signed it with its real capability. The mandate refused it anyway.',
    abort: { code: taliUsdcDemo.safetyTest.oversizedClaimAbortCode, key: 'E_AMOUNT_ABOVE_LIMIT' },
  },
  {
    kind: 'refused',
    digest: taliUsdcDemo.safetyTest.unapprovedRecipientTransaction,
    headline: 'Asked to pay an address that was not on the allowlist',
    detail: 'Correct amount, wrong recipient. Refused before the coin was touched.',
    abort: {
      code: taliUsdcDemo.safetyTest.unapprovedRecipientAbortCode,
      key: 'E_RECIPIENT_NOT_APPROVED',
    },
  },
];

/** Measured after both refusals, from the same deployment record. */
export const AFTERMATH = {
  budgetRemaining: '17 USDC',
  amountSpent: '3 USDC',
  /** USDC_SETUP.md records the two failures together, not individually. */
  gasBurnedByRefusals: '0.002095 SUI',
} as const;
