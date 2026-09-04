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

/**
 * `allowed` and `refused` are verdicts a mandate reached on a spend. `published`
 * is not a verdict — no mandate adjudicated it — so it carries its own kind
 * rather than borrowing `allowed` and blurring what the other two mean.
 */
export interface OnChainRun {
  kind: 'allowed' | 'refused' | 'published';
  digest: string;
  headline: string;
  detail: string;
  abort: { code: number; key: string } | null;
}

/**
 * The last two are absent from `taliUsdcDemo`: the reimbursement was paid from
 * the separate single-wallet demo mandate, and the upgrade touched no mandate
 * at all. Both are recorded in docs/SUBMISSION.md and
 * contracts/tali_treasury/DEPLOYMENT.md. `packages/sui-integration` is not this
 * lane's to edit, so they are declared here against those two records.
 */
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
  {
    kind: 'allowed',
    digest: 'J6fWBNa7RQXiLaVVK4ZhZSNphggNLq312HKRyhRbZQq',
    headline: 'Reimbursed an RM6 receipt as 1.484561 USDC',
    detail:
      'Read off a photo, quoted at 1 USD = 4.0416 MYR, approved by the treasurer at that exact payout, and paid from the separate single-wallet demo mandate.',
    abort: null,
  },
  {
    kind: 'published',
    digest: '86914sL2wFj9s7sfcMqdYx9ekST8FRU8Y1tLT5SAaSfN',
    headline: 'Published the payroll module in package v2',
    detail:
      'The upgrade that put run_payroll and SalaryStream on chain. No mandate adjudicated this one: it is the code the mandates run.',
    abort: null,
  },
];

/**
 * The landing copy counts these transactions in prose. Deriving the figures
 * stops the sentence drifting the next time a digest is added, which is how it
 * came to read "three" above a list of five.
 */
export const RUN_TALLY = {
  total: ON_CHAIN_RUNS.length,
  allowed: ON_CHAIN_RUNS.filter((run) => run.kind === 'allowed').length,
  refused: ON_CHAIN_RUNS.filter((run) => run.kind === 'refused').length,
} as const;

/** Measured after both refusals, from the same deployment record. */
export const AFTERMATH = {
  budgetRemaining: '17 USDC',
  amountSpent: '3 USDC',
  /** USDC_SETUP.md records the two failures together, not individually. */
  gasBurnedByRefusals: '0.002095 SUI',
} as const;
