import type { VerifiedPayrollSetup } from './setup-verification';
import { ServerError } from '../errors';

export interface PayrollSetupRegistration extends VerifiedPayrollSetup {
  id: string;
  createdAtMs: number;
}

export interface PayrollSetupRegistrationRepository {
  findByDigest(digest: string): Promise<PayrollSetupRegistration | null>;
  create(verified: VerifiedPayrollSetup): Promise<PayrollSetupRegistration>;
}

export async function registerVerifiedPayrollSetup(
  repository: PayrollSetupRegistrationRepository,
  verified: VerifiedPayrollSetup,
): Promise<PayrollSetupRegistration> {
  return (await repository.findByDigest(verified.digest)) ?? repository.create(verified);
}

export async function registerPayrollSetupDigest(
  repository: PayrollSetupRegistrationRepository,
  digest: string,
  verify: () => Promise<VerifiedPayrollSetup>,
): Promise<PayrollSetupRegistration> {
  const existing = await repository.findByDigest(digest);
  if (existing) return existing;
  const verified = await verify();
  if (verified.digest !== digest) {
    throw new ServerError(
      'payroll_setup_verification_failed',
      422,
      'The finalized transaction digest did not match the registration request.',
    );
  }
  return repository.create(verified);
}
