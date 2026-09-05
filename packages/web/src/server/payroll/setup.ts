import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  CIRCLE_TESTNET_USDC_TYPE,
  normalizeAddress,
} from '@tali/treasury-sui';
import { convertMyrToUsdc } from '@tali/shared';

import { ServerError } from '../errors';
import type { EnvLike } from '../env';
import type { FxRate } from '../fx/rates';
import { assertAuthorizedWallet, requireEmployerWallet } from '../auth/authorization';

const WAGE_MYR = '30000000';

/**
 * Enough for several runs, because a payroll mandate cannot be topped up.
 *
 * `payroll.move` funds the mandate once at creation and offers no deposit
 * entry point — only `withdraw_payroll_remaining` in the other direction. At
 * RM50 the mandate held barely more than one run of an RM30 wage, so the second
 * run aborted on 26 with no way to recover except creating another mandate.
 * Approving a piece of overtime was enough to tip it over, which is how this
 * surfaced: the approval dialog priced the next run at more than the mandate
 * had left.
 *
 * Still a fixed figure, which is the real limitation. The employer should be
 * choosing what to fund, and the register path would have to carry that choice
 * through to `setup-verification`, which re-derives the expected budget from
 * this constant to check the mandate it is about to trust.
 */
const BUDGET_MYR = '120000000';
const STATUTORY_CAP_MYR = '6000000000';

export interface PayrollSetupPreview {
  network: 'testnet';
  packageId: string;
  coinType: string;
  employer: string;
  employee: string;
  capRecipient: string;
  wageMyr: string;
  budgetMyr: string;
  budgetUsdc: string;
  maxPerRunUsdc: string;
  expiryMs: number;
  netMinBps: string;
  rate: FxRate;
  floors: Array<{
    body: 'epf' | 'socso' | 'eis';
    recipient: string;
    minBps: string;
    wageCapUsdc: string;
  }>;
}

function required(env: EnvLike, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ServerError(
      'payment_configuration_failed',
      503,
      `Payroll setup is unavailable because ${name} is not configured.`,
    );
  }
  return value;
}

export function assertPayrollEmployer(identityInput: string, env: EnvLike = process.env): string {
  const employer = requireEmployerWallet(env);
  const identity = normalizeAddress(identityInput, 'authenticated employer');
  assertAuthorizedWallet(identity, employer);
  return employer;
}

export async function createPayrollSetupPreview(input: {
  identity: string;
  employee: string;
  expiryMs: number;
  env?: EnvLike;
  rates: () => Promise<FxRate>;
  now?: () => number;
}): Promise<PayrollSetupPreview> {
  const env = input.env ?? process.env;
  const now = input.now ?? Date.now;
  const employer = assertPayrollEmployer(input.identity, env);
  if (!Number.isSafeInteger(input.expiryMs) || input.expiryMs <= now() + 60 * 60_000) {
    throw new ServerError('invalid_request', 400, 'Payroll expiry must be at least one hour in the future.');
  }

  const packageId = normalizeAddress(required(env, 'PAYROLL_PACKAGE_ID'), 'payroll package ID');
  const employee = normalizeAddress(input.employee, 'approved employee');
  let capRecipient: string;
  try {
    capRecipient = Ed25519Keypair.fromSecretKey(required(env, 'AGENT_PRIVATE_KEY')).toSuiAddress();
  } catch (error) {
    throw new ServerError(
      'payment_configuration_failed',
      503,
      'Payroll setup requires a valid backend agent key.',
      { cause: error },
    );
  }

  const epf = normalizeAddress(required(env, 'PAYROLL_EPF_ADDRESS'), 'EPF recipient');
  const socso = normalizeAddress(required(env, 'PAYROLL_SOCSO_ADDRESS'), 'SOCSO recipient');
  const eis = normalizeAddress(required(env, 'PAYROLL_EIS_ADDRESS'), 'EIS recipient');
  if (new Set([employee, epf, socso, eis]).size !== 4) {
    throw new ServerError('invalid_request', 400, 'Employee and statutory recipients must be different wallets.');
  }

  const rate = await input.rates();
  const budgetUsdc = convertMyrToUsdc(BUDGET_MYR, rate.myrPerUsd);
  const cappedBasis = convertMyrToUsdc(STATUTORY_CAP_MYR, rate.myrPerUsd);

  return {
    network: 'testnet',
    packageId,
    coinType: CIRCLE_TESTNET_USDC_TYPE,
    employer,
    employee,
    capRecipient,
    wageMyr: WAGE_MYR,
    budgetMyr: BUDGET_MYR,
    budgetUsdc,
    maxPerRunUsdc: budgetUsdc,
    expiryMs: input.expiryMs,
    netMinBps: '7000',
    rate,
    floors: [
      { body: 'epf', recipient: epf, minBps: '2300', wageCapUsdc: '0' },
      { body: 'socso', recipient: socso, minBps: '225', wageCapUsdc: cappedBasis },
      { body: 'eis', recipient: eis, minBps: '40', wageCapUsdc: cappedBasis },
    ],
  };
}
