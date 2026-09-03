import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
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

import { subtract } from '@tali/shared';

import type { PaymentExecutor } from '../claims/ports';
import { ServerError } from '../errors';
import {
  moveAbortCode,
  netGasUsed,
  signTransaction,
  submitTransaction,
  type ConfirmedTransaction,
  type PreparedTransaction,
} from './transaction';

/**
 * A ServerError, so a deployment without a signing key answers 503 under its
 * own code. Left as a plain Error it became the generic 500 every unrecognised
 * throw becomes, which tells the caller nothing about what to fix.
 */
export class PaymentConfigurationError extends ServerError {
  constructor() {
    super(
      'payment_configuration_failed',
      503,
      'Backend payment configuration requires valid Sui testnet credentials',
    );
    this.name = 'PaymentConfigurationError';
  }
}

export class PaymentSubmissionUncertainError extends Error {
  constructor(options?: ErrorOptions) {
    super('Sui payment submission status is uncertain', options);
    this.name = 'PaymentSubmissionUncertainError';
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

      const startedAt = now();
      let confirmed: ConfirmedPayment;
      try {
        confirmed = await ready.operations.submit(prepared);
      } catch {
        /* The only genuinely unknown case: the submission may or may not have
           reached the chain. The claim stays in `paying` until a human checks
           and reconciles it. */
        throw new PaymentSubmissionUncertainError();
      }
      const finalityMs = Math.max(0, now() - startedAt);
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

      /* The transfer is already confirmed successful at this point. A failure
         to re-read the mandate afterwards says nothing about the payment, and
         throwing here left a member who had been paid on a claim stuck in
         `paying` with no way out. The balance is derived instead: the transfer
         succeeded for exactly this amount. */
      let budgetAfter: string;
      let budgetRead = true;
      try {
        budgetAfter = await ready.operations.readBudget(input.mandateId);
      } catch {
        budgetRead = false;
        budgetAfter = subtract(input.budgetBefore, input.amount);
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
          message: budgetRead
            ? 'Payment confirmed on Sui testnet.'
            : 'Payment confirmed on Sui testnet. The mandate balance could not be re-read, so the remaining budget shown is derived from this transfer.',
          rawError: null,
          budgetBefore: input.budgetBefore,
          budgetAfter,
        },
      };
    },
  };
}
