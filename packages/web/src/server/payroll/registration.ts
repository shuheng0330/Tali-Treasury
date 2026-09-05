import type { Address, RegisterPayrollRequest, RegisterPayrollResponse } from '@tali/shared';
import { z } from 'zod';

import { suiAddressSchema } from '../claims/validation';
import { isServerError, ServerError } from '../errors';

const registerPayrollSchema = z
  .object({
    digest: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,64}$/, 'Invalid Sui transaction digest'),
  })
  .strict();

export interface PayrollStatutoryTermSnapshot {
  recipient: Address;
  minBps: string;
  wageCap: string;
}

export interface PayrollConfigurationSnapshot {
  creationDigest: string;
  packageId: string;
  coinType: string;
  mandateId: string;
  capId: string;
  employerWallet: Address;
  capOwnerWallet: string;
  approvedEmployees: string[];
  statutoryTerms: PayrollStatutoryTermSnapshot[];
  netMinBps: string;
  initialBudget: string;
  maxPerRun: string;
  expiryMs: string;
  registeredAtMs?: number;
}

export interface PayrollRegistrationVerifier {
  verify(input: {
    digest: string;
    employer: Address;
  }): Promise<PayrollConfigurationSnapshot>;
}

export interface PayrollRegistrationRepository {
  register(snapshot: PayrollConfigurationSnapshot): Promise<{
    configuration: PayrollConfigurationSnapshot;
    created: boolean;
  }>;
  listByEmployer?(employer: Address): Promise<PayrollConfigurationSnapshot[]>;
  listByEmployee?(employee: Address): Promise<PayrollConfigurationSnapshot[]>;
  findByMandateId?(mandateId: string): Promise<PayrollConfigurationSnapshot | null>;
}

export interface RegisterPayrollResult {
  created: boolean;
  response: RegisterPayrollResponse;
}

export function createRegisterPayrollService(deps: {
  chain: PayrollRegistrationVerifier;
  configurations: PayrollRegistrationRepository;
}) {
  return async (input: {
    actor: string;
    request: unknown;
  }): Promise<RegisterPayrollResult> => {
    let actor: Address;
    let request: RegisterPayrollRequest;
    try {
      actor = suiAddressSchema.parse(input.actor);
      request = registerPayrollSchema.parse(input.request) as RegisterPayrollRequest;
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Invalid payroll registration request', {
        cause: error,
      });
    }

    let verified: PayrollConfigurationSnapshot;
    try {
      verified = await deps.chain.verify({ digest: request.digest, employer: actor });
    } catch (error) {
      if (isServerError(error)) throw error;
      throw new ServerError(
        'payroll_registration_failed',
        502,
        'The payroll transaction could not be verified with Sui',
        { cause: error },
      );
    }

    let stored: Awaited<ReturnType<PayrollRegistrationRepository['register']>>;
    try {
      stored = await deps.configurations.register(verified);
    } catch (error) {
      if (isServerError(error)) throw error;
      throw new ServerError('database_failed', 500, 'The database operation failed', {
        cause: error,
      });
    }

    return {
      created: stored.created,
      response: {
        status: 'registered',
        mandateId: stored.configuration.mandateId as RegisterPayrollResponse['mandateId'],
        capId: stored.configuration.capId as RegisterPayrollResponse['capId'],
      },
    };
  };
}
