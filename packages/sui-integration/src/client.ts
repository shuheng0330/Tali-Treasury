import { SuiGrpcClient } from '@mysten/sui/grpc';
import { normalizeAddress, normalizeConfig } from './config.js';
import type { MandateState, TreasuryConfig } from './types.js';

export const TESTNET_GRPC_URL = 'https://fullnode.testnet.sui.io:443';

export function createTestnetClient(baseUrl = TESTNET_GRPC_URL): SuiGrpcClient {
  return new SuiGrpcClient({ network: 'testnet', baseUrl });
}

type ObjectReader = Pick<SuiGrpcClient, 'getObject'>;

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label} returned by Sui`);
  }
  return value as Record<string, unknown>;
}

function asBigInt(value: unknown, label: string): bigint {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error(`Invalid ${label} returned by Sui`);
  }
  return BigInt(value);
}

function balanceValue(value: unknown): bigint {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return BigInt(value);
  }
  const balance = asRecord(value, 'mandate budget');
  return asBigInt(balance.value ?? balance.balance, 'mandate budget');
}

function parseCoinType(objectType: string): string {
  const match = objectType.match(/::Mandate<(.+)>$/);
  if (!match?.[1]) throw new Error(`Object is not a Tali Mandate: ${objectType}`);
  return match[1];
}

export async function readMandate(
  client: ObjectReader,
  configInput: TreasuryConfig,
  mandateIdInput: string,
): Promise<MandateState> {
  const config = normalizeConfig(configInput);
  const mandateId = normalizeAddress(mandateIdInput, 'mandate ID');
  const { object } = await client.getObject({
    objectId: mandateId,
    include: { json: true },
  });

  const expectedPrefix = `${config.packageId}::treasury::Mandate<`;
  if (!object.type.startsWith(expectedPrefix)) {
    throw new Error(`Object ${mandateId} is not a mandate from the configured Tali package`);
  }

  const fields = asRecord(object.json, 'mandate data');
  const approved = fields.approved_recipients;
  if (!Array.isArray(approved) || !approved.every((value) => typeof value === 'string')) {
    throw new Error('Invalid approved recipient list returned by Sui');
  }
  if (typeof fields.revoked !== 'boolean') {
    throw new Error('Invalid revoked flag returned by Sui');
  }

  return {
    id: object.objectId,
    coinType: parseCoinType(object.type),
    initialBudget: asBigInt(fields.initial_budget, 'initial budget'),
    remainingBudget: balanceValue(fields.budget),
    amountSpent: asBigInt(fields.amount_spent, 'amount spent'),
    maxPerClaim: asBigInt(fields.max_per_claim, 'maximum per claim'),
    expiryMs: asBigInt(fields.expiry_ms, 'expiry'),
    revoked: fields.revoked,
    approvedRecipients: approved.map((address) => normalizeAddress(address)),
  };
}
