import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  buildSpendTransaction,
  createTestnetClient,
  normalizeAddress,
  readMandate,
  taliTestnetUsdcConfig,
  type TreasuryConfig,
} from '@tali/treasury-sui';

import type { PaymentExecutor } from '../claims/ports';

export class PaymentConfigurationError extends Error {
  constructor() {
    super('Backend payment configuration requires valid Sui testnet credentials');
    this.name = 'PaymentConfigurationError';
  }
}

export class PaymentSubmissionUncertainError extends Error {
  constructor(options?: ErrorOptions) {
    super('Sui payment submission status is uncertain', options);
    this.name = 'PaymentSubmissionUncertainError';
  }
}

export interface PreparedPayment {
  bytes: Uint8Array;
  signature: string;
}

export interface ConfirmedPayment {
  digest: string;
  checkpoint: string | null;
  status:
    | { success: true; error: null }
    | { success: false; error: unknown };
  gasUsed: {
    computationCost: string;
    storageCost: string;
    storageRebate: string;
    nonRefundableStorageFee: string;
  };
}

export interface PaymentOperations {
  prepare(input: {
    agentCapId: string;
    mandateId: string;
    recipient: string;
    amount: bigint;
  }): Promise<PreparedPayment>;
  submit(input: PreparedPayment): Promise<ConfirmedPayment>;
  readBudget(mandateId: string): Promise<string>;
}

interface PaymentEnvironment {
  AGENT_PRIVATE_KEY?: string;
  AGENT_CAP_ID?: string;
  SUI_NETWORK?: string;
  SUI_GRPC_URL?: string;
}

interface ExecutorOptions {
  env?: PaymentEnvironment;
  operations?: PaymentOperations;
  config?: TreasuryConfig;
  now?: () => number;
}

function createDefaultOperations(input: {
  keypair: Ed25519Keypair;
  config: TreasuryConfig;
  grpcUrl?: string;
}): PaymentOperations {
  const client = createTestnetClient(input.grpcUrl);

  return {
    async prepare(payment) {
      const transaction = buildSpendTransaction(input.config, payment);
      transaction.setSenderIfNotSet(input.keypair.toSuiAddress());
      const bytes = await transaction.build({ client });
      const { signature } = await input.keypair.signTransaction(bytes);
      return { bytes, signature };
    },

    async submit(payment) {
      const submitted = await client.executeTransaction({
        transaction: payment.bytes,
        signatures: [payment.signature],
        include: { effects: true },
      });
      const confirmed = await client.waitForTransaction({
        result: submitted,
        include: { effects: true },
      });
      const transaction =
        confirmed.$kind === 'Transaction'
          ? confirmed.Transaction
          : confirmed.FailedTransaction;
      if (!transaction.effects) {
        throw new Error('Confirmed transaction did not include effects');
      }

      return {
        digest: transaction.digest,
        checkpoint: transaction.checkpoint,
        status: transaction.status,
        gasUsed: transaction.effects.gasUsed,
      };
    },

    async readBudget(mandateId) {
      const mandate = await readMandate(client, input.config, mandateId);
      return mandate.remainingBudget.toString();
    },
  };
}

export function createSuiPaymentExecutor(
  options: ExecutorOptions = {},
): PaymentExecutor {
  const env = options.env ?? process.env;
  const config = options.config ?? taliTestnetUsdcConfig;
  let runtime:
    | { agentCapId: string; operations: PaymentOperations }
    | undefined;

  function getRuntime() {
    if (runtime) return runtime;

    try {
      if ((env.SUI_NETWORK ?? 'testnet').trim().toLowerCase() !== 'testnet') {
        throw new Error('Unsupported Sui network');
      }
      const privateKey = env.AGENT_PRIVATE_KEY?.trim();
      const capId = env.AGENT_CAP_ID?.trim();
      if (!privateKey || !capId) throw new Error('Missing payment credentials');

      const keypair = Ed25519Keypair.fromSecretKey(privateKey);
      const agentCapId = normalizeAddress(capId, 'AgentCap ID');
      runtime = {
        agentCapId,
        operations:
          options.operations ??
          createDefaultOperations({
            keypair,
            config,
            grpcUrl: env.SUI_GRPC_URL,
          }),
      };
      return runtime;
    } catch {
      throw new PaymentConfigurationError();
    }
  }

  return {
    assertReady() {
      getRuntime();
    },

    async execute(input) {
      const ready = getRuntime();
      await ready.operations.prepare({
        agentCapId: ready.agentCapId,
        mandateId: input.mandateId,
        recipient: input.recipient,
        amount: BigInt(input.amount),
      });
      throw new Error('Payment outcome mapping is not implemented');
    },
  };
}
