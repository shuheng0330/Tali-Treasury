/**
 * Transactions that were actually executed against the deployed package on Sui
 * testnet, recorded in contracts/tali_treasury/DEPLOYMENT.md. Every digest here
 * resolves in an explorer.
 *
 * Amounts are written out rather than passed through `toDisplay`, because these
 * are SUI at 9 decimals and `COIN_DECIMALS` is 6. Formatting them with the app's
 * money helpers would print 0.05 SUI as 50.00.
 */

export const LIVE_MANDATE_ID =
  '0x471cc5a25025c63e3fb58c03c631383a5362882db618a410bc7a666a1bfe7e83';

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
    digest: '7VrBh8jwTgffxhARM72T5BmbgLzDuC8EEYJTgNQHzkt8',
    headline: 'Paid 0.05 SUI to an approved member',
    detail: 'Inside the cap, inside the budget, recipient on the list. Emitted PaymentMade.',
    abort: null,
  },
  {
    kind: 'refused',
    digest: 'JD1cvKrj3ieWF8mhWbVJh7pgZpzM1z1VADor53ZsuT4g',
    headline: 'Asked for 0.15 SUI against a 0.10 cap',
    detail: 'The agent signed it. The mandate refused it.',
    abort: { code: 5, key: 'E_AMOUNT_ABOVE_LIMIT' },
  },
  {
    kind: 'refused',
    digest: '6xU1WoPA53AcckWYi6t8k133TWSsz8obkZK45yZRmiWk',
    headline: 'Asked to pay an address that was not on the allowlist',
    detail: 'Correct amount, wrong recipient. Refused before the coin was touched.',
    abort: { code: 7, key: 'E_RECIPIENT_NOT_APPROVED' },
  },
];

/** Measured after both refusals, from the same deployment record. */
export const AFTERMATH = {
  budgetRemaining: '0.45 SUI',
  amountSpent: '0.05 SUI',
  /** DEPLOYMENT.md records the two failures together, not individually. */
  gasBurnedByRefusals: '0.00209 SUI',
} as const;
