import type {
  Address,
  OpenSalaryStreamRequest,
  SalaryStreamRegistrationView,
} from '@tali/shared';

import { ServerError } from '../errors';
import type { PayrollConfigurationService } from '../payroll/configurations';

export type SalaryStreamRecord = SalaryStreamRegistrationView;

export interface SalaryStreamRegistry {
  findByMandateId(mandateId: string): Promise<SalaryStreamRecord | null>;
  create(stream: SalaryStreamRecord): Promise<SalaryStreamRecord>;
}

export type OpenSalaryStreamSubmission =
  | { status: 'opened'; digest: string; streamId: string }
  | { status: 'refused'; digest?: string; abortCode: number | null; message: string };

export interface SalaryStreamOpeningChain {
  open(input: {
    packageId: string;
    payrollCapId: string;
    mandateId: string;
    capOwnerWallet: string;
    employee: Address;
    totalAmount: string;
    startedAtMs: number;
    endsAtMs: number;
  }): Promise<OpenSalaryStreamSubmission>;
}

const POSITIVE_AMOUNT = /^[1-9][0-9]*$/;

export function createSalaryStreamOpeningService(deps: {
  configurations: PayrollConfigurationService;
  streams: SalaryStreamRegistry;
  chain: SalaryStreamOpeningChain;
  now?: () => number;
}) {
  return {
    async find(actor: string, mandateId: string): Promise<SalaryStreamRecord | null> {
      await deps.configurations.requireAuthorized(actor, mandateId);
      return deps.streams.findByMandateId(mandateId);
    },

    async open(actor: string, request: OpenSalaryStreamRequest): Promise<SalaryStreamRecord> {
      const configuration = await deps.configurations.requireAuthorized(
        actor,
        request.mandateId,
        'employer',
      );
      if (!POSITIVE_AMOUNT.test(request.totalAmount)) {
        throw new ServerError('invalid_request', 400, 'Stream amount must be positive micro-USDC');
      }
      if (!Number.isInteger(request.durationMinutes) || request.durationMinutes < 1 || request.durationMinutes > 1_440) {
        throw new ServerError('invalid_request', 400, 'Stream duration must be between 1 minute and 24 hours');
      }
      if (BigInt(request.totalAmount) > BigInt(configuration.snapshot.maxPerRun)) {
        throw new ServerError('invalid_request', 400, 'Stream amount exceeds this payroll mandate limit');
      }

      const existing = await deps.streams.findByMandateId(configuration.snapshot.mandateId);
      if (existing) {
        throw new ServerError('stream_already_exists', 409, 'This payroll already has a salary stream');
      }

      const startedAtMs = (deps.now ?? Date.now)();
      const endsAtMs = startedAtMs + request.durationMinutes * 60_000;
      if (endsAtMs > Number(configuration.snapshot.expiryMs)) {
        throw new ServerError('invalid_request', 400, 'The stream would end after the payroll mandate expires');
      }

      const submission = await deps.chain.open({
        packageId: configuration.snapshot.packageId,
        payrollCapId: configuration.snapshot.capId,
        mandateId: configuration.snapshot.mandateId,
        capOwnerWallet: configuration.snapshot.capOwnerWallet,
        employee: configuration.view.employee,
        totalAmount: request.totalAmount,
        startedAtMs,
        endsAtMs,
      });
      if (submission.status === 'refused') {
        throw new ServerError(
          'stream_open_refused',
          409,
          submission.abortCode === null
            ? submission.message
            : `The contract refused this stream on abort ${submission.abortCode}: ${submission.message}`,
        );
      }

      try {
        return await deps.streams.create({
          streamId: submission.streamId as SalaryStreamRecord['streamId'],
          mandateId: configuration.snapshot.mandateId as SalaryStreamRecord['mandateId'],
          employee: configuration.view.employee,
          totalAmount: request.totalAmount,
          startedAtMs,
          endsAtMs,
          creationDigest: submission.digest,
          createdAtMs: startedAtMs,
        });
      } catch (error) {
        /* The chain has already committed at this point. Calling it a failed
           opening would invite a second stream, so surface the digest and make
           the uncertain outcome explicit. */
        throw new ServerError(
          'payment_submission_uncertain',
          502,
          `Stream transaction ${submission.digest} succeeded but could not be recorded. Do not open another stream.`,
          { cause: error },
        );
      }
    },
  };
}

export type SalaryStreamOpeningService = ReturnType<typeof createSalaryStreamOpeningService>;
