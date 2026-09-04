import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  buildRunPayrollTransaction,
  createTestnetClient,
  normalizeAddress,
  parseTreasuryError,
  taliTestnetUsdcConfig,
  treasuryErrorFromCode,
  type TreasuryConfig,
} from '@tali/treasury-sui';

import { ServerError } from '../errors';
import type { PayrollChainPort, PayrollSubmission } from '../payroll/ports';
import {
  moveAbortCode,
  signTransaction,
  signTransactionForRecordedRefusal,
  submitTransaction,
  type ConfirmedTransaction,
  type PreparedTransaction,
} from './transaction';

/**
 * A ServerError, so the route answers 502 with its own code rather than the
 * generic 500 every unrecognised throw becomes. The difference matters: the
 * generic path renders as "Nothing was paid", which is the one thing nobody
 * can say about a transaction that may have landed.
 */
export class PayrollSubmissionUncertainError extends ServerError {
  constructor(options?: ErrorOptions) {
    super(
      'payment_submission_uncertain',
      502,
      'The payroll transaction was sent and its outcome is unknown. Check the chain before running it again.',
      options,
    );
    this.name = 'PayrollSubmissionUncertainError';
  }
}

export interface PayrollOperations {
  prepare(input: {
    payrollCapId: string;
    mandateId: string;
    employee: string;
    gross: bigint;
    net: bigint;
    statutoryAmounts: bigint[];
    recordRefusal?: boolean;
  }): Promise<PreparedTransaction>;
  submit(prepared: PreparedTransaction): Promise<ConfirmedTransaction>;
}

interface PayrollEnvironment {
  AGENT_PRIVATE_KEY?: string | undefined;
  PAYROLL_CAP_ID?: string | undefined;
  PAYROLL_MANDATE_ID?: string | undefined;
  PAYROLL_PACKAGE_ID?: string | undefined;
  SUI_NETWORK?: string | undefined;
  SUI_GRPC_URL?: string | undefined;
}

interface ExecutorOptions {
  env?: PayrollEnvironment;
  operations?: PayrollOperations;
  config?: TreasuryConfig;
}

function createDefaultOperations(input: {
  keypair: Ed25519Keypair;
  config: TreasuryConfig;
  grpcUrl?: string;
}): PayrollOperations {
  const client = createTestnetClient(input.grpcUrl);

  return {
    async prepare(run) {
      const sign = run.recordRefusal ? signTransactionForRecordedRefusal : signTransaction;
      return sign({
        transaction: buildRunPayrollTransaction(input.config, run),
        keypair: input.keypair,
        client,
      });
    },

    async submit(prepared) {
      return submitTransaction(client, prepared);
    },
  };
}

export function createSuiPayrollExecutor(options: ExecutorOptions = {}): PayrollChainPort {
  const env = options.env ?? process.env;

  /* The payroll module ships in a package upgrade, which gives it a new
     address. Calls have to target that one, not the constant pointing at the
     original publish. */
  const base = options.config ?? taliTestnetUsdcConfig;
  const packageId = env.PAYROLL_PACKAGE_ID?.trim();
  const config = packageId ? { ...base, packageId } : base;
  let runtime:
    | { payrollCapId: string; mandateId: string; operations: PayrollOperations }
    | undefined;

  function getRuntime() {
    if (runtime) return runtime;

    try {
      if ((env.SUI_NETWORK ?? 'testnet').trim().toLowerCase() !== 'testnet') {
        throw new Error('Unsupported Sui network');
      }
      const privateKey = env.AGENT_PRIVATE_KEY?.trim();
      const capId = env.PAYROLL_CAP_ID?.trim();
      const mandateId = env.PAYROLL_MANDATE_ID?.trim();
      if (!privateKey || !capId || !mandateId) {
        throw new Error('Missing payroll credentials');
      }

      runtime = {
        payrollCapId: normalizeAddress(capId, 'PayrollCap ID'),
        mandateId: normalizeAddress(mandateId, 'payroll mandate ID'),
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
        'Payroll runs need the published payroll module and its signing credentials',
      );
    }
  }

  return {
    assertReady() {
      getRuntime();
    },

    async run(input): Promise<PayrollSubmission> {
      const ready = getRuntime();

      let prepared: PreparedTransaction;
      try {
        prepared = await ready.operations.prepare({
          payrollCapId: ready.payrollCapId,
          mandateId: ready.mandateId,
          employee: input.employee,
          gross: BigInt(input.gross),
          net: BigInt(input.net),
          statutoryAmounts: input.statutoryAmounts.map((amount) => BigInt(amount)),
          recordRefusal: input.recordRefusal,
        });
      } catch (error) {
        /* Nothing was signed, so nothing can have been paid. Recorded as a
           refusal rather than thrown, because the run already exists as
           pending and would otherwise sit there looking in flight. */
        return {
          status: 'refused',
          abortCode: null,
          message:
            error instanceof Error
              ? `This run could not be prepared: ${error.message}`
              : 'This run could not be prepared for Sui.',
        };
      }

      let confirmed: ConfirmedTransaction;
      try {
        confirmed = await ready.operations.submit(prepared);
      } catch (error) {
        /* The transaction may well have landed. Recording it as failed could
           mark a payroll run unpaid when the wages are already gone, and a
           retry would pay everyone twice, so this stops and asks for a human. */
        throw new PayrollSubmissionUncertainError({ cause: error });
      }

      if (!confirmed.status.success) {
        const code = moveAbortCode(confirmed.status.error);
        const failure =
          code === null
            ? parseTreasuryError(confirmed.status.error)
            : treasuryErrorFromCode(code);
        return {
          status: 'refused',
          abortCode: failure.code,
          message: failure.message,
          digest: confirmed.digest,
        };
      }

      return { status: 'paid', digest: confirmed.digest };
    },
  };
}
