import { TransactionError } from '@mysten/sui/client';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { SuiGrpcClient } from '@mysten/sui/grpc';
import {
  CIRCLE_TESTNET_USDC_TYPE,
  createTestnetClient,
  normalizeAddress,
  readPayrollCap,
  readPayrollMandate,
  type PayrollCapState,
  type PayrollMandateState,
  type TreasuryConfig,
} from '@tali/treasury-sui';

import type { EnvLike } from '../env';
import { ServerError } from '../errors';
import type {
  PayrollConfigurationSnapshot,
  PayrollRegistrationVerifier,
} from '../payroll/registration';

export interface PayrollRegistrationTransaction {
  digest: string;
  checkpoint: string | null;
  sender: string;
  status: { success: true; error: null } | { success: false; error: unknown };
  createdObjects: Array<{ objectId: string; type: string; version: string }>;
}

export interface PayrollRegistrationOperations {
  lookup(digest: string): Promise<PayrollRegistrationTransaction | null>;
  readMandate(mandateId: string, version: string): Promise<{
    state: PayrollMandateState;
    previousTransaction: string | null;
  }>;
  readCap(capId: string, version: string): Promise<PayrollCapState>;
}

interface RegistrationConfig {
  packageId: string;
  coinType: string;
  capOwner: string;
  statutoryRecipients: string[];
}

const TESTNET_GRAPHQL_URL = 'https://graphql.testnet.sui.io/graphql';
const HISTORICAL_OBJECT_QUERY = `
  query HistoricalPayrollObject($address: SuiAddress!, $version: UInt53!) {
    object(address: $address, version: $version) {
      address
      version
      digest
      previousTransaction { digest }
      owner { __typename ... on AddressOwner { address { address } } }
      asMoveObject { contents { json type { repr } } }
    }
  }
`;

interface HistoricalObjectResult {
  object: {
    address: string;
    version: number;
    digest: string;
    previousTransaction: { digest: string } | null;
    owner: { __typename: string; address?: { address: string } | null };
    asMoveObject: {
      contents: { json: unknown; type: { repr: string } };
    } | null;
  } | null;
}

export function isPendingTransactionLookupError(error: unknown): boolean {
  return (error instanceof TransactionError && error.reason === 'notFound')
    || (error instanceof Error && error.name === 'TimeoutError');
}

function configurationFailure(): ServerError {
  return new ServerError(
    'payroll_registration_configuration_failed',
    503,
    'Payroll registration configuration is unavailable',
  );
}

function refused(message = 'The transaction does not create a supported payroll'): ServerError {
  return new ServerError('payroll_registration_refused', 422, message);
}

function rpcFailure(error: unknown): ServerError {
  return new ServerError(
    'payroll_registration_failed',
    502,
    'The payroll transaction could not be verified with Sui',
    { cause: error },
  );
}

function pending(): ServerError {
  return new ServerError(
    'payroll_registration_pending',
    409,
    'The payroll transaction is not finalized yet. Retry registration shortly.',
  );
}

function loadConfiguration(env: EnvLike): RegistrationConfig {
  try {
    if ((env.SUI_NETWORK ?? 'testnet').trim().toLowerCase() !== 'testnet') {
      throw new Error('Unsupported network');
    }
    const privateKey = env.AGENT_PRIVATE_KEY?.trim();
    const packageId = env.PAYROLL_PACKAGE_ID?.trim();
    const recipients = [
      env.PAYROLL_EPF_ADDRESS?.trim(),
      env.PAYROLL_SOCSO_ADDRESS?.trim(),
      env.PAYROLL_EIS_ADDRESS?.trim(),
    ];
    if (!privateKey || !packageId || recipients.some((address) => !address)) {
      throw new Error('Missing payroll registration configuration');
    }
    const statutoryRecipients = recipients.map((address) => normalizeAddress(address!));
    if (new Set(statutoryRecipients).size !== 3) {
      throw new Error('Statutory recipients must be distinct');
    }
    return {
      packageId: normalizeAddress(packageId, 'payroll package ID'),
      coinType: CIRCLE_TESTNET_USDC_TYPE,
      capOwner: normalizeAddress(
        Ed25519Keypair.fromSecretKey(privateKey).toSuiAddress(),
        'PayrollCap owner',
      ),
      statutoryRecipients,
    };
  } catch {
    throw configurationFailure();
  }
}

function createDefaultOperations(input: {
  client: SuiGrpcClient;
  config: TreasuryConfig;
  graphqlUrl?: string;
}): PayrollRegistrationOperations {
  const graphql = new SuiGraphQLClient({
    network: 'testnet',
    url: input.graphqlUrl ?? TESTNET_GRAPHQL_URL,
  });

  async function historicalObject(objectId: string, versionInput: string) {
    const version = Number(versionInput);
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new Error('Invalid created object version');
    }
    const result = await graphql.query<HistoricalObjectResult, {
      address: string;
      version: number;
    }>({
      query: HISTORICAL_OBJECT_QUERY,
      variables: { address: objectId, version },
    });
    const historical = result.data?.object;
    const contents = historical?.asMoveObject?.contents;
    if (result.errors?.length || !historical || !contents) {
      throw new Error('Historical payroll object is unavailable');
    }
    const owner = historical.owner.__typename === 'AddressOwner'
      && historical.owner.address?.address
      ? { $kind: 'AddressOwner', AddressOwner: historical.owner.address.address }
      : { $kind: historical.owner.__typename };
    return {
      objectId: historical.address,
      version: String(historical.version),
      digest: historical.digest,
      type: contents.type.repr,
      owner,
      previousTransaction: historical.previousTransaction?.digest ?? null,
      json: contents.json,
    };
  }

  return {
    async lookup(digest) {
      let result: unknown;
      try {
        result = await input.client.waitForTransaction({
          digest,
          timeout: 5_000,
          include: { effects: true, transaction: true, objectTypes: true },
        });
      } catch (error) {
        if (isPendingTransactionLookupError(error)) return null;
        throw error;
      }
      const envelope = result as {
        $kind?: string;
        Transaction?: RegistrationTransactionValue;
        FailedTransaction?: RegistrationTransactionValue;
      };
      const transaction = envelope.$kind === 'Transaction'
        ? envelope.Transaction
        : envelope.FailedTransaction;
      if (!transaction?.effects || !transaction.transaction || !transaction.objectTypes) {
        throw new Error('Transaction verification fields are missing');
      }
      const objectTypes = transaction.objectTypes;
      return {
        digest: transaction.digest,
        checkpoint: transaction.checkpoint,
        sender: transaction.transaction.sender ?? '',
        status: transaction.status,
        createdObjects: transaction.effects.changedObjects
          .filter((change) => change.idOperation === 'Created')
          .map((change) => ({
            objectId: change.objectId,
            type: objectTypes[change.objectId] ?? '',
            version: change.outputVersion ?? '',
          })),
      };
    },

    async readMandate(mandateId, version) {
      const object = await historicalObject(mandateId, version);
      const reader = { getObject: async () => ({ object }) };
      const state = await readPayrollMandate(reader as never, input.config, mandateId);
      return { state, previousTransaction: object.previousTransaction };
    },

    async readCap(capId, version) {
      const object = await historicalObject(capId, version);
      const reader = { getObject: async () => ({ object }) };
      return readPayrollCap(reader as never, input.config, capId);
    },
  };
}

interface RegistrationTransactionValue {
  digest: string;
  checkpoint: string | null;
  status: PayrollRegistrationTransaction['status'];
  transaction?: { sender?: string | null };
  objectTypes?: Record<string, string>;
  effects?: {
    changedObjects: Array<{
      objectId: string;
      idOperation: string;
      outputVersion: string | null;
    }>;
  };
}

function requireSupportedMandate(input: {
  mandate: PayrollMandateState;
  employer: string;
  config: RegistrationConfig;
  nowMs: number;
}): void {
  const { mandate, employer, config, nowMs } = input;
  const expectedRates = [2300n, 225n, 40n];
  const recipients = mandate.floors.map((floor) => floor.recipient);
  if (
    mandate.employer !== employer
    || mandate.coinType !== config.coinType
    || mandate.approvedEmployees.length !== 1
    || mandate.floors.length !== 3
    || new Set(recipients).size !== 3
    || recipients.some((recipient, index) => recipient !== config.statutoryRecipients[index])
    || mandate.floors.some((floor, index) => floor.minBps !== expectedRates[index])
    || mandate.floors[0]?.wageCap !== 0n
    || !mandate.floors[1] || mandate.floors[1].wageCap <= 0n
    || mandate.floors[2]?.wageCap !== mandate.floors[1].wageCap
    || mandate.netMinBps !== 7000n
    || mandate.budget <= 0n
    || mandate.maxPerRun <= 0n
    || mandate.maxPerRun > mandate.budget
    || mandate.expiryMs <= BigInt(nowMs)
    || mandate.revoked
    || mandate.committed !== 0n
    || mandate.spendable !== mandate.budget
    || mandate.totalPaid !== 0n
    || mandate.runCount !== 0n
  ) {
    throw refused();
  }
}

export function createSuiPayrollRegistrationVerifier(options: {
  env?: EnvLike;
  operations?: PayrollRegistrationOperations;
  now?: () => number;
} = {}): PayrollRegistrationVerifier {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;

  return {
    async verify({ digest, employer }) {
      const config = loadConfiguration(env);
      const operations = options.operations ?? createDefaultOperations({
        client: createTestnetClient(env.SUI_GRPC_URL),
        config: { packageId: config.packageId, coinType: config.coinType },
        graphqlUrl: env.SUI_GRAPHQL_URL,
      });

      let transaction: PayrollRegistrationTransaction | null;
      try {
        transaction = await operations.lookup(digest);
      } catch (error) {
        throw rpcFailure(error);
      }
      if (!transaction || !transaction.checkpoint) throw pending();
      if (!transaction.status.success || transaction.digest !== digest) throw refused();

      let sender: string;
      try {
        sender = normalizeAddress(transaction.sender, 'transaction sender');
      } catch {
        throw refused();
      }
      if (sender !== employer) throw refused();

      const mandateType = `${config.packageId}::payroll::PayrollMandate<${config.coinType}>`;
      const capType = `${config.packageId}::payroll::PayrollCap`;
      const mandates = transaction.createdObjects.filter((object) => object.type === mandateType);
      const caps = transaction.createdObjects.filter((object) => object.type === capType);
      if (mandates.length !== 1 || caps.length !== 1) throw refused();
      const mandateId = mandates[0]!.objectId;
      const capId = caps[0]!.objectId;
      const mandateVersion = mandates[0]!.version;
      const capVersion = caps[0]!.version;
      if (!/^\d+$/.test(mandateVersion) || !/^\d+$/.test(capVersion)) throw refused();

      let mandateRead: Awaited<ReturnType<PayrollRegistrationOperations['readMandate']>>;
      let cap: PayrollCapState;
      try {
        [mandateRead, cap] = await Promise.all([
          operations.readMandate(mandateId, mandateVersion),
          operations.readCap(capId, capVersion),
        ]);
      } catch (error) {
        throw rpcFailure(error);
      }
      const mandate = mandateRead.state;
      if (
        mandateRead.previousTransaction !== digest
        || cap.previousTransaction !== digest
        || mandate.id !== mandateId
        || cap.id !== capId
        || cap.mandateId !== mandateId
        || cap.owner !== config.capOwner
      ) {
        throw refused();
      }
      requireSupportedMandate({ mandate, employer, config, nowMs: now() });

      const snapshot: PayrollConfigurationSnapshot = {
        creationDigest: digest,
        packageId: config.packageId,
        coinType: config.coinType,
        mandateId,
        capId,
        employerWallet: employer,
        capOwnerWallet: cap.owner,
        approvedEmployees: mandate.approvedEmployees,
        statutoryTerms: mandate.floors.map((floor) => ({
          recipient: floor.recipient,
          minBps: floor.minBps.toString(),
          wageCap: floor.wageCap.toString(),
        })),
        netMinBps: mandate.netMinBps.toString(),
        initialBudget: mandate.budget.toString(),
        maxPerRun: mandate.maxPerRun.toString(),
        expiryMs: mandate.expiryMs.toString(),
      };
      return snapshot;
    },
  };
}
