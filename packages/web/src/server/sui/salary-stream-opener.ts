import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  buildOpenStreamTransaction,
  createTestnetClient,
  normalizeAddress,
  parseTreasuryError,
  readSalaryStream,
  taliTestnetUsdcConfig,
  treasuryErrorFromCode,
  type SalaryStreamState,
  type TreasuryConfig,
} from '@tali/treasury-sui';

import { ServerError } from '../errors';
import type {
  OpenSalaryStreamSubmission,
  SalaryStreamOpeningChain,
} from '../streams/opening';
import { assertPayrollSignerOwner, type PayrollEnvironment } from './payroll-executor';
import {
  moveAbortCode,
  signTransaction,
  submitTransaction,
  type ConfirmedTransaction,
  type PreparedTransaction,
} from './transaction';

interface StreamEnvironment extends PayrollEnvironment {
  SUI_GRPC_URL?: string;
}

interface CreatedObject { objectId: string; type: string }

export interface SalaryStreamOpenOperations {
  prepare(input: {
    payrollCapId: string;
    mandateId: string;
    employee: string;
    totalAmount: bigint;
    startedAtMs: bigint;
    endsAtMs: bigint;
  }): Promise<PreparedTransaction>;
  submit(prepared: PreparedTransaction): Promise<ConfirmedTransaction>;
  createdObjects(digest: string): Promise<CreatedObject[]>;
  read(streamId: string): Promise<SalaryStreamState>;
}

function createDefaultOperations(input: {
  keypair: Ed25519Keypair;
  config: TreasuryConfig;
  grpcUrl?: string;
}): SalaryStreamOpenOperations {
  const client = createTestnetClient(input.grpcUrl);
  return {
    prepare(stream) {
      return signTransaction({
        transaction: buildOpenStreamTransaction(input.config, stream),
        keypair: input.keypair,
        client,
      });
    },
    submit(prepared) {
      return submitTransaction(client, prepared);
    },
    async createdObjects(digest) {
      const result = await client.waitForTransaction({
        digest,
        include: { effects: true, objectTypes: true },
      }) as unknown as {
        $kind: 'Transaction' | 'FailedTransaction';
        Transaction?: TransactionValue;
        FailedTransaction?: TransactionValue;
      };
      const transaction = result.$kind === 'Transaction' ? result.Transaction : result.FailedTransaction;
      if (!transaction?.effects || !transaction.objectTypes) {
        throw new Error('Confirmed stream transaction is missing object details');
      }
      return transaction.effects.changedObjects
        .filter((object) => object.idOperation === 'Created')
        .map((object) => ({
          objectId: object.objectId,
          type: transaction.objectTypes![object.objectId] ?? '',
        }));
    },
    read(streamId) {
      return readSalaryStream(client, input.config, streamId);
    },
  };
}

interface TransactionValue {
  objectTypes?: Record<string, string>;
  effects?: { changedObjects: Array<{ objectId: string; idOperation: string }> };
}

export function createSuiSalaryStreamOpener(options: {
  env?: StreamEnvironment;
  operations?: SalaryStreamOpenOperations;
  config?: TreasuryConfig;
} = {}): SalaryStreamOpeningChain {
  const env = options.env ?? (process.env as StreamEnvironment);
  const base = options.config ?? taliTestnetUsdcConfig;

  return {
    async open(input): Promise<OpenSalaryStreamSubmission> {
      if ((env.SUI_NETWORK ?? 'testnet').trim().toLowerCase() !== 'testnet') {
        throw new ServerError('payment_configuration_failed', 503, 'Salary stream creation is only configured for Testnet');
      }
      const privateKey = env.AGENT_PRIVATE_KEY?.trim();
      if (!privateKey) {
        throw new ServerError('payment_configuration_failed', 503, 'Salary stream signing credentials are unavailable');
      }

      let keypair: Ed25519Keypair;
      let config: TreasuryConfig;
      try {
        keypair = Ed25519Keypair.fromSecretKey(privateKey);
        config = { ...base, packageId: normalizeAddress(input.packageId, 'payroll package ID') };
        assertPayrollSignerOwner(input.capOwnerWallet, env);
      } catch (error) {
        if (error instanceof ServerError) throw error;
        throw new ServerError('payment_configuration_failed', 503, 'Salary stream configuration is unavailable', { cause: error });
      }

      const operations = options.operations ?? createDefaultOperations({
        keypair,
        config,
        grpcUrl: env.SUI_GRPC_URL,
      });

      let prepared: PreparedTransaction;
      try {
        prepared = await operations.prepare({
          payrollCapId: input.payrollCapId,
          mandateId: input.mandateId,
          employee: input.employee,
          totalAmount: BigInt(input.totalAmount),
          startedAtMs: BigInt(input.startedAtMs),
          endsAtMs: BigInt(input.endsAtMs),
        });
      } catch (error) {
        return {
          status: 'refused',
          abortCode: null,
          message: error instanceof Error ? error.message : 'The stream transaction could not be prepared',
        };
      }

      let confirmed: ConfirmedTransaction;
      try {
        confirmed = await operations.submit(prepared);
      } catch (error) {
        throw new ServerError(
          'payment_submission_uncertain',
          502,
          'The stream transaction was sent and its outcome is unknown. Check Sui before trying again.',
          { cause: error },
        );
      }
      if (!confirmed.status.success) {
        const code = moveAbortCode(confirmed.status.error);
        const failure = code === null
          ? parseTreasuryError(confirmed.status.error)
          : treasuryErrorFromCode(code);
        return {
          status: 'refused',
          abortCode: failure.code,
          message: failure.message,
          digest: confirmed.digest,
        };
      }

      let created: CreatedObject[];
      try {
        created = await operations.createdObjects(confirmed.digest);
      } catch (error) {
        throw new ServerError(
          'payment_submission_uncertain',
          502,
          `Stream transaction ${confirmed.digest} succeeded, but its new object could not be identified.`,
          { cause: error },
        );
      }
      const expectedType = `${config.packageId}::payroll::SalaryStream<${config.coinType}>`;
      const streams = created.filter((object) => object.type === expectedType);
      if (streams.length !== 1) {
        throw new ServerError(
          'payment_submission_uncertain',
          502,
          `Stream transaction ${confirmed.digest} succeeded, but did not expose exactly one expected stream.`,
        );
      }

      const streamId = normalizeAddress(streams[0]!.objectId, 'salary stream ID');
      let stream: SalaryStreamState;
      try {
        stream = await operations.read(streamId);
      } catch (error) {
        throw new ServerError(
          'payment_submission_uncertain',
          502,
          `Stream transaction ${confirmed.digest} succeeded, but its object could not be verified. Do not open another stream.`,
          { cause: error },
        );
      }
      if (
        stream.mandateId !== normalizeAddress(input.mandateId, 'payroll mandate ID')
        || stream.employee !== normalizeAddress(input.employee, 'employee')
        || stream.totalAmount !== BigInt(input.totalAmount)
        || stream.startedAtMs !== BigInt(input.startedAtMs)
        || stream.endsAtMs !== BigInt(input.endsAtMs)
        || stream.withdrawn !== 0n
      ) {
        throw new ServerError(
          'payment_submission_uncertain',
          502,
          `Stream transaction ${confirmed.digest} succeeded, but its object did not match the request.`,
        );
      }
      return { status: 'opened', digest: confirmed.digest, streamId };
    },
  };
}
