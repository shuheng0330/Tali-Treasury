import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  CIRCLE_TESTNET_USDC_TYPE,
  normalizeAddress,
} from '@tali/treasury-sui';
import { convertMyrToUsdc } from '@tali/shared';

import { ServerError } from '../errors';
import type { EnvLike } from '../env';
import type { FxRate } from '../fx/rates';

const WAGE_MYR = '30000000';
const BUDGET_MYR = '50000000';
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
  const employer = normalizeAddress(required(env, 'PAYROLL_EMPLOYER_ADDRESS'), 'payroll employer');
  const identity = normalizeAddress(identityInput, 'authenticated employer');
  if (identity !== employer) {
    throw new ServerError(
      'payroll_employer_forbidden',
      403,
      'Only the configured employer can set up payroll.',
    );
  }
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
