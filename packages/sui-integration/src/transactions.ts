import { Transaction } from '@mysten/sui/transactions';
import { normalizeAddress, normalizeConfig } from './config.js';
import type {
  CreateMandateInput,
  RevokeInput,
  SpendInput,
  TreasuryConfig,
  WithdrawInput,
} from './types.js';

function requirePositive(value: bigint, label: string): void {
  if (value <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
}

function target(packageId: string, functionName: string): string {
  return `${packageId}::treasury::${functionName}`;
}

export function buildCreateMandateTransaction(
  configInput: TreasuryConfig,
  input: CreateMandateInput,
): Transaction {
  const config = normalizeConfig(configInput);
  const sender = normalizeAddress(input.sender, 'sender');
  const agent = normalizeAddress(input.agent, 'agent address');
  const recipients = input.approvedRecipients.map((recipient) =>
    normalizeAddress(recipient, 'approved recipient'),
  );

  requirePositive(input.budget, 'Budget');
  requirePositive(input.maxPerClaim, 'Maximum per claim');

  if (input.maxPerClaim > input.budget) {
    throw new Error('Maximum per claim cannot exceed the budget');
  }
  if (input.expiryMs <= BigInt(Date.now())) {
    throw new Error('Expiry must be in the future');
  }
  if (recipients.length === 0) {
    throw new Error('At least one approved recipient is required');
  }
  if (new Set(recipients).size !== recipients.length) {
    throw new Error('Approved recipients must not contain duplicates');
  }

  const tx = new Transaction();
  const fundingCoin = tx.coin({ type: config.coinType, balance: input.budget });
  const adminCap = tx.moveCall({
    target: target(config.packageId, 'create_mandate'),
    typeArguments: [config.coinType],
    arguments: [
      tx.pure.address(agent),
      fundingCoin,
      tx.pure.u64(input.maxPerClaim),
      tx.pure.u64(input.expiryMs),
      tx.pure.vector('address', recipients),
    ],
  });

  tx.transferObjects([adminCap], sender);
  return tx;
}

export function buildSpendTransaction(
  configInput: TreasuryConfig,
  input: SpendInput,
): Transaction {
  const config = normalizeConfig(configInput);
  requirePositive(input.amount, 'Payment amount');

  const tx = new Transaction();
  tx.moveCall({
    target: target(config.packageId, 'spend'),
    typeArguments: [config.coinType],
    arguments: [
      tx.object(normalizeAddress(input.agentCapId, 'AgentCap ID')),
      tx.object(normalizeAddress(input.mandateId, 'mandate ID')),
      tx.pure.address(normalizeAddress(input.recipient, 'recipient')),
      tx.pure.u64(input.amount),
      tx.object(config.clockId),
    ],
  });
  return tx;
}

export function buildRevokeTransaction(
  configInput: TreasuryConfig,
  input: RevokeInput,
): Transaction {
  const config = normalizeConfig(configInput);
  const tx = new Transaction();
  tx.moveCall({
    target: target(config.packageId, 'revoke'),
    typeArguments: [config.coinType],
    arguments: [
      tx.object(normalizeAddress(input.adminCapId, 'AdminCap ID')),
      tx.object(normalizeAddress(input.mandateId, 'mandate ID')),
    ],
  });
  return tx;
}

export function buildWithdrawTransaction(
  configInput: TreasuryConfig,
  input: WithdrawInput,
): Transaction {
  const config = normalizeConfig(configInput);
  const tx = new Transaction();
  tx.moveCall({
    target: target(config.packageId, 'withdraw_remaining'),
    typeArguments: [config.coinType],
    arguments: [
      tx.object(normalizeAddress(input.adminCapId, 'AdminCap ID')),
      tx.object(normalizeAddress(input.mandateId, 'mandate ID')),
      tx.pure.address(normalizeAddress(input.recipient, 'withdrawal recipient')),
    ],
  });
  return tx;
}
