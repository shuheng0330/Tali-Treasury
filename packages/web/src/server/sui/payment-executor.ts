import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { TransactionDataBuilder } from '@mysten/sui/transactions';
import {
  buildSpendTransaction,
  createTestnetClient,
  normalizeAddress,
  parseTreasuryError,
  readMandate,
  taliTestnetUsdcConfig,
  treasuryErrorFromCode,
  type TreasuryConfig,
} from '@tali/treasury-sui';

import type { PaymentExecutionResult, PaymentExecutor } from '../claims/ports';
import {
  moveAbortCode,
  netGasUsed,
  signTransaction,
  submitTransaction,
  readTransaction,
  type ConfirmedTransaction,
  type PreparedTransaction,
} from './transaction';

export class PaymentConfigurationError extends Error {
  constructor() {
    super('Backend payment configuration requires valid Sui testnet credentials');
    this.name = 'PaymentConfigurationError';
  }
}

export class PaymentSubmissionUncertainError extends Error {
  readonly digest: string | null;

  constructor(digest: string | null = null, options?: ErrorOptions) {
    super('Sui payment submission status is uncertain', options);
    this.name = 'PaymentSubmissionUncertainError';
    this.digest = digest;
  }
}

export type PreparedPayment = PreparedTransaction;
export type ConfirmedPayment = ConfirmedTransaction;

export interface PaymentOperations {
  prepare(input: {
    agentCapId: string;
    mandateId: string;
    recipient: string;
    amount: bigint;
  }): Promise<PreparedPayment>;
  submit(input: PreparedPayment): Promise<ConfirmedPayment>;
  lookup(digest: string): Promise<ConfirmedPayment | null>;
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
      return signTransaction({
        transaction: buildSpendTransaction(input.config, payment),
        keypair: input.keypair,
        client,
      });
    },

    async submit(payment) {
      return submitTransaction(client, payment);
    },

    async lookup(digest) {
      return readTransaction(client, digest);
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
  const now = options.now ?? Date.now;
  let runtime:
    | { agentCapId: string; operations: PaymentOperations }
    | undefined;
  let readOperations: Pick<PaymentOperations, 'lookup' | 'readBudget'> | undefined;

  function assertTestnet() {
    if ((env.SUI_NETWORK ?? 'testnet').trim().toLowerCase() !== 'testnet') {
      throw new PaymentConfigurationError();
    }
  }

  function getReadOperations() {
    assertTestnet();
    if (options.operations) return options.operations;
    if (runtime) return runtime.operations;
    if (!readOperations) {
      const client = createTestnetClient(env.SUI_GRPC_URL);
      readOperations = {
        lookup: (digest) => readTransaction(client, digest),
        async readBudget(mandateId) {
          const mandate = await readMandate(client, config, mandateId);
          return mandate.remainingBudget.toString();
        },
      };
    }
    return readOperations;
  }

  function getRuntime() {
    if (runtime) return runtime;

    try {
      assertTestnet();
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

    async execute(input, recordAttempt) {
      const ready = getRuntime();
      let prepared: PreparedPayment;
      try {
        prepared = await ready.operations.prepare({
          agentCapId: ready.agentCapId,
          mandateId: input.mandateId,
          recipient: input.recipient,
          amount: BigInt(input.amount),
        });
      } catch {
        return {
          status: 'rejected',
          payment: {
            ok: false,
            digest: null,
            checkpoint: null,
            gasUsed: null,
            finalityMs: null,
            abortCode: null,
            abortKey: 'TRANSACTION_PREPARATION_FAILED',
            message: 'Payment could not be prepared for Sui testnet.',
            rawError: null,
            budgetBefore: input.budgetBefore,
            budgetAfter: input.budgetBefore,
          },
        };
      }

      const preparedAtMs = now();
      const digest = TransactionDataBuilder.getDigestFromBytes(prepared.bytes);
      await recordAttempt({ digest, preparedAtMs });
      let confirmed: ConfirmedPayment;
      try {
        confirmed = await ready.operations.submit(prepared);
      } catch {
        throw new PaymentSubmissionUncertainError(digest);
      }
      if (confirmed.digest !== digest) {
        throw new PaymentSubmissionUncertainError(digest);
      }
      return mapConfirmed(confirmed, input, ready.operations, preparedAtMs);
    },

    async reconcile(input) {
      const operations = getReadOperations();
      let confirmed: ConfirmedPayment | null;
      try {
        confirmed = await operations.lookup(input.digest);
      } catch {
        throw new PaymentSubmissionUncertainError(input.digest);
      }
      if (confirmed === null) return { status: 'pending', digest: input.digest };
      if (confirmed.digest !== input.digest) {
        throw new PaymentSubmissionUncertainError(input.digest);
      }
      return mapConfirmed(confirmed, input, operations, input.preparedAtMs);
    },
  };

  async function mapConfirmed(
    confirmed: ConfirmedPayment,
    input: {
      mandateId: string;
      budgetBefore: string;
    },
    operations: Pick<PaymentOperations, 'readBudget'>,
    preparedAtMs: number,
  ): Promise<PaymentExecutionResult> {
      const finalityMs = Math.max(0, now() - preparedAtMs);
      if (!confirmed.status.success) {
        const code = moveAbortCode(confirmed.status.error);
        const treasuryError =
          code === null
            ? parseTreasuryError(confirmed.status.error)
            : treasuryErrorFromCode(code);
        return {
          status: 'rejected',
          payment: {
            ok: false,
            digest: confirmed.digest,
            checkpoint: confirmed.checkpoint,
            gasUsed: netGasUsed(confirmed.gasUsed),
            finalityMs,
            abortCode: treasuryError.code,
            abortKey: treasuryError.key,
            message: treasuryError.message,
            rawError: null,
            budgetBefore: input.budgetBefore,
            budgetAfter: input.budgetBefore,
          },
        };
      }

      let budgetAfter: string;
      try {
        budgetAfter = await operations.readBudget(input.mandateId);
      } catch {
        throw new PaymentSubmissionUncertainError(confirmed.digest);
      }

      return {
        status: 'paid',
        payment: {
          ok: true,
          digest: confirmed.digest,
          checkpoint: confirmed.checkpoint,
          gasUsed: netGasUsed(confirmed.gasUsed),
          finalityMs,
          abortCode: null,
          abortKey: null,
          message: 'Payment confirmed on Sui testnet.',
          rawError: null,
          budgetBefore: input.budgetBefore,
          budgetAfter,
        },
      };
  }
}
