import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  buildWithdrawEarnedTransaction,
  createTestnetClient,
  normalizeAddress,
  parseTreasuryError,
  readSalaryStream,
  taliTestnetUsdcConfig,
  treasuryErrorFromCode,
  type SalaryStreamState,
  type TreasuryConfig,
} from '@tali/treasury-sui';

import { StreamNotConfiguredError, type StreamChainPort } from '../streams/ports';
import {
  moveAbortCode,
  signTransaction,
  submitTransaction,
  type ConfirmedTransaction,
  type PreparedTransaction,
} from './transaction';

export interface StreamOperations {
  read(streamId: string): Promise<SalaryStreamState>;
  prepare(input: { streamId: string; mandateId: string }): Promise<PreparedTransaction>;
  submit(prepared: PreparedTransaction): Promise<ConfirmedTransaction>;
}

interface StreamEnvironment {
  AGENT_PRIVATE_KEY?: string | undefined;
  PAYROLL_PACKAGE_ID?: string | undefined;
  SUI_NETWORK?: string | undefined;
  SUI_GRPC_URL?: string | undefined;
}

interface ChainOptions {
  env?: StreamEnvironment;
  operations?: StreamOperations;
  config?: TreasuryConfig;
}

function createDefaultOperations(input: {
  keypair: Ed25519Keypair;
  config: TreasuryConfig;
  grpcUrl?: string;
}): StreamOperations {
  const client = createTestnetClient(input.grpcUrl);

  return {
    async read(streamId) {
      return readSalaryStream(client, input.config, streamId);
    },

    async prepare({ streamId, mandateId }) {
      return signTransaction({
        transaction: buildWithdrawEarnedTransaction(input.config, { streamId, mandateId }),
        keypair: input.keypair,
        client,
      });
    },

    async submit(prepared) {
      return submitTransaction(client, prepared);
    },
  };
}

export function createSuiStreamChain(options: ChainOptions = {}): StreamChainPort {
  const env = options.env ?? process.env;

  /* Streams live in the upgraded package, so its address is configured rather
     than taken from the original publish. */
  const base = options.config ?? taliTestnetUsdcConfig;
  const packageId = env.PAYROLL_PACKAGE_ID?.trim();
  const config = packageId ? { ...base, packageId } : base;
  let operations: StreamOperations | undefined;

  function getOperations(): StreamOperations {
    if (operations) return operations;

    if ((env.SUI_NETWORK ?? 'testnet').trim().toLowerCase() !== 'testnet') {
      throw new StreamNotConfiguredError();
    }
    const privateKey = env.AGENT_PRIVATE_KEY?.trim();
    if (!privateKey) throw new StreamNotConfiguredError();

    try {
      operations =
        options.operations ??
        createDefaultOperations({
          keypair: Ed25519Keypair.fromSecretKey(privateKey),
          config,
          grpcUrl: env.SUI_GRPC_URL,
        });
    } catch {
      throw new StreamNotConfiguredError();
    }
    return operations;
  }

  return {
    async read(streamId) {
      return getOperations().read(normalizeAddress(streamId, 'salary stream ID'));
    },

    async withdraw(streamIdInput) {
      const ready = getOperations();
      const streamId = normalizeAddress(streamIdInput, 'salary stream ID');

      /* The stream is read first for its mandate, and again afterwards for the
         amount. The contract knows what it paid; deriving the figure from the
         clock here would report a number the chain never moved. */
      const before = await ready.read(streamId);
      const prepared = await ready.prepare({
        streamId,
        mandateId: before.mandateId,
      });
      const confirmed = await ready.submit(prepared);

      if (!confirmed.status.success) {
        const code = moveAbortCode(confirmed.status.error);
        if (code === null) {
          /* A failure with no Move abort is not the contract refusing, and
             there is no honest code to report it under: every number in the
             table already means something specific. */
          throw new Error(parseTreasuryError(confirmed.status.error).message);
        }
        const failure = treasuryErrorFromCode(code);
        return {
          status: 'refused',
          abortCode: code,
          message: failure.message,
        };
      }

      const after = await ready.read(streamId);
      const paid = after.withdrawn - before.withdrawn;

      return {
        status: 'paid',
        digest: confirmed.digest,
        amount: (paid > 0n ? paid : 0n).toString(),
      };
    },
  };
}
