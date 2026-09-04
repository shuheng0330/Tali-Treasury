import type { SuiGrpcClient } from '@mysten/sui/grpc';
import {
  CIRCLE_TESTNET_USDC_TYPE,
  createTestnetClient,
  normalizeAddress,
  readPayrollMandate,
} from '@tali/treasury-sui';

import { ServerError } from '../errors';
import type { EnvLike } from '../env';
import type { FxRate } from '../fx/rates';
import { assertPayrollEmployer, createPayrollSetupPreview } from './setup';

type VerificationClient = Pick<SuiGrpcClient, 'waitForTransaction' | 'getObject'>;

export interface VerifiedPayrollSetup {
  digest: string;
  checkpoint: string;
  mandateId: string;
  capId: string;
  packageId: string;
  employer: string;
  employee: string;
  capRecipient: string;
  coinType: string;
  budgetUsdc: string;
  maxPerRunUsdc: string;
  expiryMs: number;
}

function invalid(message: string, cause?: unknown): ServerError {
  return new ServerError('payroll_setup_verification_failed', 422, message, { cause });
}

function sameBigInts(actual: bigint[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === BigInt(expected[index]!));
}

export async function verifyPayrollSetupTransaction(input: {
  identity: string;
  digest: string;
  rates: () => Promise<FxRate>;
  env?: EnvLike;
  client?: VerificationClient;
  now?: () => number;
}): Promise<VerifiedPayrollSetup> {
  const env = input.env ?? process.env;
  const client = input.client ?? createTestnetClient(env.SUI_GRPC_URL?.trim());
  const employer = assertPayrollEmployer(input.identity, env);
  const identity = employer;

  const packageId = normalizeAddress(env.PAYROLL_PACKAGE_ID ?? '', 'payroll package ID');
  let result;
  try {
    result = await client.waitForTransaction({
      digest: input.digest,
      include: { effects: true, objectTypes: true, transaction: true },
    });
  } catch (error) {
    throw invalid('The payroll setup transaction could not be finalized.', error);
  }
  if (result.$kind !== 'Transaction' || !result.Transaction.status.success) {
    throw invalid('The payroll setup transaction did not succeed on Sui Testnet.');
  }

  const transaction = result.Transaction;
  if (!transaction.checkpoint) throw invalid('The payroll setup transaction is not checkpointed yet.');
  if (!transaction.transaction?.sender || normalizeAddress(transaction.transaction.sender) !== employer) {
    throw invalid('The payroll setup transaction was not signed by the configured employer.');
  }

  const createdIds = transaction.effects.changedObjects
    .filter((object) => object.idOperation === 'Created')
    .map((object) => object.objectId);
  const mandateType = `${packageId}::payroll::PayrollMandate<${CIRCLE_TESTNET_USDC_TYPE}>`;
  const capType = `${packageId}::payroll::PayrollCap`;
  const mandateIds = createdIds.filter((id) => transaction.objectTypes[id] === mandateType);
  const capIds = createdIds.filter((id) => transaction.objectTypes[id] === capType);
  if (mandateIds.length !== 1 || capIds.length !== 1) {
    throw invalid('The transaction did not create exactly one configured PayrollMandate and PayrollCap.');
  }

  const mandateId = mandateIds[0]!;
  const capId = capIds[0]!;
  try {
    const mandate = await readPayrollMandate(
      client,
      { packageId, coinType: CIRCLE_TESTNET_USDC_TYPE },
      mandateId,
    );
    if (mandate.approvedEmployees.length !== 1) {
      throw invalid('The payroll mandate must approve exactly one demo employee.');
    }
    const employee = mandate.approvedEmployees[0]!;
    const expected = await createPayrollSetupPreview({
      identity,
      employee,
      expiryMs: Number(mandate.expiryMs),
      env,
      rates: input.rates,
      now: input.now,
    });
    const recipients = mandate.floors.map((floor) => floor.recipient);
    const expectedRecipients = expected.floors.map((floor) => floor.recipient);
    const capObject = await client.getObject({ objectId: capId, include: { json: true } });
    const capJson = capObject.object.json;
    const capMandateId = capJson && typeof capJson.mandate_id === 'string'
      ? normalizeAddress(capJson.mandate_id, 'PayrollCap mandate ID')
      : null;
    const capOwner = capObject.object.owner.$kind === 'AddressOwner'
      ? normalizeAddress(capObject.object.owner.AddressOwner, 'PayrollCap owner')
      : null;

    if (
      mandate.employer !== employer ||
      mandate.coinType !== CIRCLE_TESTNET_USDC_TYPE ||
      mandate.budget !== BigInt(expected.budgetUsdc) ||
      mandate.committed !== 0n ||
      mandate.totalPaid !== 0n ||
      mandate.runCount !== 0n ||
      mandate.revoked ||
      mandate.maxPerRun !== BigInt(expected.maxPerRunUsdc) ||
      mandate.netMinBps !== BigInt(expected.netMinBps) ||
      recipients.length !== expectedRecipients.length ||
      recipients.some((recipient, index) => recipient !== expectedRecipients[index]) ||
      !sameBigInts(mandate.floors.map((floor) => floor.minBps), expected.floors.map((floor) => floor.minBps)) ||
      !sameBigInts(mandate.floors.map((floor) => floor.wageCap), expected.floors.map((floor) => floor.wageCapUsdc)) ||
      capObject.object.type !== capType ||
      capOwner !== expected.capRecipient ||
      capMandateId !== normalizeAddress(mandateId)
    ) {
      throw invalid('The created payroll objects do not match the server-approved setup.');
    }

    return {
      digest: transaction.digest,
      checkpoint: transaction.checkpoint,
      mandateId: normalizeAddress(mandateId),
      capId: normalizeAddress(capId),
      packageId,
      employer,
      employee,
      capRecipient: expected.capRecipient,
      coinType: mandate.coinType,
      budgetUsdc: mandate.budget.toString(),
      maxPerRunUsdc: mandate.maxPerRun.toString(),
      expiryMs: Number(mandate.expiryMs),
    };
  } catch (error) {
    if (error instanceof ServerError) throw error;
    throw invalid('The created payroll objects could not be verified.', error);
  }
}
