import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  buildRevokeTransaction,
  createTestnetClient,
  normalizeAddress,
  parseTreasuryError,
  taliTestnetUsdcConfig,
  treasuryErrorFromCode,
  type TreasuryConfig,
} from '@tali/treasury-sui';

import { ServerError } from '../errors';
import type { RevokeMandatePort, RevokeSubmission } from '../mandate/ports';
import {
  moveAbortCode,
  signTransaction,
  submitTransaction,
  type ConfirmedTransaction,
  type PreparedTransaction,
} from './transaction';

export interface RevokeOperations {
  prepare(input: { adminCapId: string; mandateId: string }): Promise<PreparedTransaction>;
  submit(prepared: PreparedTransaction): Promise<ConfirmedTransaction>;
}

interface RevokeEnvironment {
  TREASURER_PRIVATE_KEY?: string | undefined;
  AGENT_PRIVATE_KEY?: string | undefined;
  ADMIN_CAP_ID?: string | undefined;
  SUI_NETWORK?: string | undefined;
  SUI_GRPC_URL?: string | undefined;
}

interface ExecutorOptions {
  env?: RevokeEnvironment;
  operations?: RevokeOperations;
  config?: TreasuryConfig;
}

function createDefaultOperations(input: {
  keypair: Ed25519Keypair;
  config: TreasuryConfig;
  grpcUrl?: string;
}): RevokeOperations {
  const client = createTestnetClient(input.grpcUrl);

  return {
    async prepare({ adminCapId, mandateId }) {
      return signTransaction({
        transaction: buildRevokeTransaction(input.config, { adminCapId, mandateId }),
        keypair: input.keypair,
        client,
      });
    },

    async submit(prepared) {
      return submitTransaction(client, prepared);
    },
  };
}

/**
 * Revocation is signed with the AdminCap, which the treasurer holds — not the
 * AgentCap the payment path uses. A deployment where the backend key does not
 * own that object cannot revoke, and says so rather than failing at submission.
 */
export function createSuiRevokeExecutor(options: ExecutorOptions = {}): RevokeMandatePort {
  const env = options.env ?? process.env;
  const config = options.config ?? taliTestnetUsdcConfig;
  let runtime: { adminCapId: string; operations: RevokeOperations } | undefined;

  function getRuntime() {
    if (runtime) return runtime;

    try {
      if ((env.SUI_NETWORK ?? 'testnet').trim().toLowerCase() !== 'testnet') {
        throw new Error('Unsupported Sui network');
      }
      /* The treasurer's key if one is configured, because the AdminCap is
         theirs. Falling back to the agent key only works where the same
         address holds both, which is a deployment choice, not an assumption. */
      const privateKey = env.TREASURER_PRIVATE_KEY?.trim() || env.AGENT_PRIVATE_KEY?.trim();
      const capId = env.ADMIN_CAP_ID?.trim();
      if (!privateKey || !capId) throw new Error('Missing revocation credentials');

      runtime = {
        adminCapId: normalizeAddress(capId, 'AdminCap ID'),
        operations:
          options.operations ??
          createDefaultOperations({
            keypair: Ed25519Keypair.fromSecretKey(privateKey),
            config,
            grpcUrl: env.SUI_GRPC_URL,
          }),
      };
      return runtime;
    } catch {
      throw new ServerError(
        'payment_configuration_failed',
        503,
        'Revoking needs the treasurer key that owns the AdminCap, which this deployment does not have',
      );
    }
  }

  return {
    assertReady() {
      getRuntime();
    },

    async revoke(mandateId): Promise<RevokeSubmission> {
      const ready = getRuntime();
      const prepared = await ready.operations.prepare({
        adminCapId: ready.adminCapId,
        mandateId,
      });
      const confirmed = await ready.operations.submit(prepared);

      if (!confirmed.status.success) {
        const code = moveAbortCode(confirmed.status.error);
        const failure =
          code === null
            ? parseTreasuryError(confirmed.status.error)
            : treasuryErrorFromCode(code);
        return { status: 'refused', abortCode: failure.code, message: failure.message };
      }

      return { status: 'revoked', digest: confirmed.digest };
    },
  };
}
