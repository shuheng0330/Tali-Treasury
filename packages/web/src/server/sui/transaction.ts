import type { SuiGrpcClient } from '@mysten/sui/grpc';
import { TransactionError } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

/**
 * Signing, submitting and reading the outcome of a Move call.
 *
 * Shared by the claims and payroll executors so that both read a refusal the
 * same way. The abort code is the whole point of this system: a wrong or
 * missing one turns "the contract refused to underpay EPF" into an unexplained
 * failure.
 */

export interface PreparedTransaction {
  bytes: Uint8Array;
  signature: string;
}

export interface ConfirmedTransaction {
  digest: string;
  checkpoint: string | null;
  status: { success: true; error: null } | { success: false; error: unknown };
  gasUsed: {
    computationCost: string;
    storageCost: string;
    storageRebate: string;
    nonRefundableStorageFee: string;
  };
}

export type ExecutionClient = Pick<
  SuiGrpcClient,
  'executeTransaction' | 'waitForTransaction'
>;

interface TransactionLookupClient {
  getTransaction(input: {
    digest: string;
    include: { effects: true };
  }): Promise<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function moveAbortCode(value: unknown): number | null {
  const error = asRecord(value);
  if (!error) return null;
  const moveAbort = asRecord(error.MoveAbort);
  if (error.$kind !== 'MoveAbort' || !moveAbort) return null;
  const code = moveAbort.abortCode;
  if (typeof code !== 'string' && typeof code !== 'number') return null;
  const parsed = Number(code);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function netGasUsed(gas: ConfirmedTransaction['gasUsed']): string {
  const netGas =
    BigInt(gas.computationCost) +
    BigInt(gas.storageCost) +
    BigInt(gas.nonRefundableStorageFee) -
    BigInt(gas.storageRebate);
  return (netGas < 0n ? 0n : netGas).toString();
}

export async function signTransaction(input: {
  transaction: Transaction;
  keypair: Ed25519Keypair;
  client: SuiGrpcClient;
}): Promise<PreparedTransaction> {
  input.transaction.setSenderIfNotSet(input.keypair.toSuiAddress());
  const bytes = await input.transaction.build({ client: input.client });
  const { signature } = await input.keypair.signTransaction(bytes);
  return { bytes, signature };
}

/**
 * Builds an intentionally failing safety transaction without executing the
 * gRPC resolver's preflight check. The kind is still resolved by Sui, but the
 * complete transaction is built offline with a bounded gas budget so the
 * actual Move refusal can be recorded on Testnet.
 */
export async function signTransactionForRecordedRefusal(input: {
  transaction: Transaction;
  keypair: Ed25519Keypair;
  client: SuiGrpcClient;
}): Promise<PreparedTransaction> {
  const sender = input.keypair.toSuiAddress();
  input.transaction.setSenderIfNotSet(sender);
  const kind = await input.transaction.build({ client: input.client, onlyTransactionKind: true });
  const transaction = Transaction.fromKind(kind);
  const gasBudget = 50_000_000n;
  const [gasPrice, coins] = await Promise.all([
    input.client.getReferenceGasPrice(),
    input.client.listCoins({ owner: sender, coinType: '0x2::sui::SUI', limit: 10 }),
  ]);
  const gas = coins.objects[0];
  if (!gas) throw new Error('The backend signer has no SUI gas coin');

  transaction.setSender(sender);
  transaction.setGasBudget(gasBudget);
  transaction.setGasPrice(BigInt(gasPrice.referenceGasPrice));
  transaction.setGasPayment([{ objectId: gas.objectId, version: gas.version, digest: gas.digest }]);
  const bytes = await transaction.build();
  const { signature } = await input.keypair.signTransaction(bytes);
  return { bytes, signature };
}

export async function submitTransaction(
  client: ExecutionClient,
  prepared: PreparedTransaction,
): Promise<ConfirmedTransaction> {
  const submitted = await client.executeTransaction({
    transaction: prepared.bytes,
    signatures: [prepared.signature],
    include: { effects: true },
  });
  const confirmed = await client.waitForTransaction({
    result: submitted,
    include: { effects: true },
  });
  const transaction =
    confirmed.$kind === 'Transaction' ? confirmed.Transaction : confirmed.FailedTransaction;
  if (!transaction.effects) {
    throw new Error('Confirmed transaction did not include effects');
  }

  return {
    digest: transaction.digest,
    checkpoint: transaction.checkpoint,
    status: transaction.status,
    gasUsed: transaction.effects.gasUsed,
  };
}

export async function readTransaction(
  client: TransactionLookupClient,
  digest: string,
): Promise<ConfirmedTransaction | null> {
  let confirmed: unknown;
  try {
    confirmed = await client.getTransaction({ digest, include: { effects: true } });
  } catch (error) {
    if (error instanceof TransactionError && error.reason === 'notFound') return null;
    throw error;
  }

  const result = confirmed as {
    $kind?: string;
    Transaction?: Record<string, unknown>;
    FailedTransaction?: Record<string, unknown>;
  };
  const transaction =
    result.$kind === 'Transaction' ? result.Transaction : result.FailedTransaction;
  const effects = transaction?.effects as
    | { gasUsed?: ConfirmedTransaction['gasUsed'] }
    | undefined;
  if (
    !transaction ||
    typeof transaction.digest !== 'string' ||
    !effects?.gasUsed ||
    !transaction.status
  ) {
    throw new Error('Confirmed transaction did not include effects');
  }

  return {
    digest: transaction.digest,
    checkpoint:
      typeof transaction.checkpoint === 'string' ? transaction.checkpoint : null,
    status: transaction.status as ConfirmedTransaction['status'],
    gasUsed: effects.gasUsed,
  };
}
