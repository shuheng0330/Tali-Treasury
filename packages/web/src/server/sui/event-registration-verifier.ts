import type { SuiGrpcClient } from '@mysten/sui/grpc';
import {
  CIRCLE_TESTNET_USDC_TYPE,
  TALI_TESTNET_PACKAGE_ID,
  createTestnetClient,
  normalizeAddress,
  readMandate,
} from '@tali/treasury-sui';

import type { EnvLike } from '../env';
import { ServerError } from '../errors';
import type {
  EventRegistrationSnapshot,
  EventRegistrationVerifier,
} from '../events/registration';

type RegistrationClient = Pick<SuiGrpcClient, 'waitForTransaction' | 'getObject'>;

interface CreatedObject {
  objectId: string;
  idOperation: string;
}

interface RegistrationTransaction {
  digest: string;
  checkpoint: string | null;
  transaction?: { sender?: string | null };
  status: { success: boolean; error?: unknown };
  objectTypes?: Record<string, string>;
  effects?: { changedObjects: CreatedObject[] };
}

interface RegistrationConfig {
  packageId: string;
  coinType: string;
  agentWallet: string;
}

function configFailure(): ServerError {
  return new ServerError(
    'event_registration_configuration_failed',
    503,
    'Event registration configuration is unavailable',
  );
}

function refused(message = 'The transaction does not create a supported expense treasury'): ServerError {
  return new ServerError('event_registration_refused', 422, message);
}

function verificationFailure(cause: unknown): ServerError {
  return new ServerError(
    'event_registration_failed',
    502,
    'The treasury transaction could not be verified with Sui',
    { cause },
  );
}

function loadConfig(env: EnvLike): RegistrationConfig {
  try {
    if ((env.SUI_NETWORK ?? 'testnet').trim().toLowerCase() !== 'testnet') {
      throw new Error('unsupported network');
    }
    const packageId = normalizeAddress(
      env.TALI_PACKAGE_ID?.trim() || TALI_TESTNET_PACKAGE_ID,
      'treasury package ID',
    );
    const coinType = env.TALI_COIN_TYPE?.trim() || CIRCLE_TESTNET_USDC_TYPE;
    if (coinType !== CIRCLE_TESTNET_USDC_TYPE) throw new Error('unsupported coin type');
    const agentWallet = normalizeAddress(
      env.TALI_AGENT_WALLET?.trim() ||
        env.AGENT_ADDRESS?.trim() ||
        env.NEXT_PUBLIC_AGENT_ADDRESS?.trim() ||
        '',
      'backend agent address',
    );
    return { packageId, coinType, agentWallet };
  } catch {
    throw configFailure();
  }
}

function objectOwner(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const owner = value as { $kind?: string; AddressOwner?: unknown };
  if (owner.$kind !== 'AddressOwner' || typeof owner.AddressOwner !== 'string') return null;
  try {
    return normalizeAddress(owner.AddressOwner, 'object owner');
  } catch {
    return null;
  }
}

function capMandateId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const json = value as { mandate_id?: unknown };
  if (typeof json.mandate_id !== 'string') return null;
  try {
    return normalizeAddress(json.mandate_id, 'cap mandate ID');
  } catch {
    return null;
  }
}

export function createSuiEventRegistrationVerifier(options: {
  env?: EnvLike;
  client?: RegistrationClient;
  now?: () => number;
} = {}): EventRegistrationVerifier {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;

  return {
    async verify({ digest, treasurer }) {
      const config = loadConfig(env);
      const client = options.client ?? createTestnetClient(env.SUI_GRPC_URL);

      let result: RegistrationTransaction;
      try {
        const envelope = (await client.waitForTransaction({
          digest,
          include: { effects: true, objectTypes: true, transaction: true },
        })) as unknown as {
          $kind?: string;
          Transaction?: RegistrationTransaction;
          FailedTransaction?: RegistrationTransaction;
        };
        result = (
          envelope.$kind === 'Transaction'
            ? envelope.Transaction
            : envelope.FailedTransaction
        ) as RegistrationTransaction;
      } catch (error) {
        throw verificationFailure(error);
      }

      if (
        !result ||
        result.digest !== digest ||
        !result.checkpoint ||
        !result.status?.success ||
        !result.effects ||
        !result.transaction
      ) {
        throw refused('The treasury transaction did not succeed on Sui Testnet.');
      }

      let sender: string;
      try {
        sender = normalizeAddress(result.transaction.sender ?? '', 'transaction sender');
      } catch {
        throw refused();
      }
      if (sender !== treasurer) {
        throw refused('The treasury transaction was not signed by the authenticated treasurer.');
      }

      const objectTypes = result.objectTypes ?? {};
      const created = result.effects.changedObjects.filter(
        (object) => object.idOperation === 'Created',
      );
      const mandateType = `${config.packageId}::treasury::Mandate<${config.coinType}>`;
      const adminCapType = `${config.packageId}::treasury::AdminCap`;
      const agentCapType = `${config.packageId}::treasury::AgentCap`;
      const mandates = created.filter((object) => objectTypes[object.objectId] === mandateType);
      const adminCaps = created.filter((object) => objectTypes[object.objectId] === adminCapType);
      const agentCaps = created.filter((object) => objectTypes[object.objectId] === agentCapType);
      if (mandates.length !== 1 || adminCaps.length !== 1 || agentCaps.length !== 1) {
        throw refused();
      }

      const mandateId = normalizeAddress(mandates[0]!.objectId, 'mandate ID');
      const adminCapId = normalizeAddress(adminCaps[0]!.objectId, 'AdminCap ID');
      const agentCapId = normalizeAddress(agentCaps[0]!.objectId, 'AgentCap ID');

      let mandate;
      let adminCap: { object: { type: string; owner: unknown; json: unknown } };
      let agentCap: { object: { type: string; owner: unknown; json: unknown } };
      try {
        [mandate, adminCap, agentCap] = await Promise.all([
          readMandate(client, { packageId: config.packageId, coinType: config.coinType }, mandateId),
          client.getObject({ objectId: adminCapId, include: { json: true } }) as Promise<typeof adminCap>,
          client.getObject({ objectId: agentCapId, include: { json: true } }) as Promise<typeof agentCap>,
        ]);
      } catch (error) {
        throw verificationFailure(error);
      }

      const expiryMs = Number(mandate.expiryMs);
      if (
        mandate.id !== mandateId ||
        mandate.coinType !== config.coinType ||
        mandate.initialBudget <= 0n ||
        mandate.maxPerClaim <= 0n ||
        mandate.maxPerClaim > mandate.initialBudget ||
        mandate.amountSpent !== 0n ||
        mandate.remainingBudget !== mandate.initialBudget ||
        mandate.revoked ||
        !Number.isSafeInteger(expiryMs) ||
        expiryMs <= now() ||
        mandate.approvedRecipients.length === 0 ||
        adminCap.object.type !== adminCapType ||
        agentCap.object.type !== agentCapType ||
        objectOwner(adminCap.object.owner) !== treasurer ||
        objectOwner(agentCap.object.owner) !== config.agentWallet ||
        capMandateId(adminCap.object.json) !== mandateId ||
        capMandateId(agentCap.object.json) !== mandateId
      ) {
        throw refused('The created treasury objects do not match the configured setup.');
      }

      return {
        digest,
        mandateId,
        packageId: config.packageId,
        coinType: config.coinType,
        treasurerWallet: treasurer,
        agentWallet: config.agentWallet,
        approvedRecipients: mandate.approvedRecipients,
        initialBudget: mandate.initialBudget.toString(),
        maxPerClaim: mandate.maxPerClaim.toString(),
        expiryMs,
      };
    },
  };
}
