import { describe, expect, it, vi } from 'vitest';

import { registerPayrollSetupDigest, registerVerifiedPayrollSetup } from './setup-registration';
import type { VerifiedPayrollSetup } from './setup-verification';

const verified: VerifiedPayrollSetup = {
  digest: '4'.repeat(44),
  checkpoint: '123',
  packageId: `0x${'c'.repeat(64)}`,
  mandateId: `0x${'1'.repeat(64)}`,
  capId: `0x${'2'.repeat(64)}`,
  employer: `0x${'a'.repeat(64)}`,
  employee: `0x${'b'.repeat(64)}`,
  capRecipient: `0x${'d'.repeat(64)}`,
  coinType: `0x${'e'.repeat(64)}::usdc::USDC`,
  budgetUsdc: '12371338',
  maxPerRunUsdc: '12371338',
  expiryMs: 1_788_281_999_000,
};
const registration = { ...verified, id: 'registration-id', createdAtMs: 1_788_000_000_000 };

describe('verified payroll setup registration', () => {
  it('returns an existing digest without inserting again', async () => {
    const repository = {
      findByDigest: vi.fn(async () => registration),
      create: vi.fn(async () => registration),
    };

    await expect(registerVerifiedPayrollSetup(repository, verified)).resolves.toEqual(registration);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('creates one record when the digest is new', async () => {
    const repository = {
      findByDigest: vi.fn(async () => null),
      create: vi.fn(async () => registration),
    };

    await expect(registerVerifiedPayrollSetup(repository, verified)).resolves.toEqual(registration);
    expect(repository.create).toHaveBeenCalledOnce();
    expect(repository.create).toHaveBeenCalledWith(verified);
  });

  it('replays a stored digest without depending on the chain or FX provider', async () => {
    const repository = {
      findByDigest: vi.fn(async () => registration),
      create: vi.fn(async () => registration),
    };
    const verify = vi.fn(async () => verified);

    await expect(registerPayrollSetupDigest(repository, verified.digest, verify)).resolves.toEqual(registration);
    expect(verify).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('refuses a verifier result for a different digest', async () => {
    const repository = {
      findByDigest: vi.fn(async () => null),
      create: vi.fn(async () => registration),
    };

    await expect(registerPayrollSetupDigest(
      repository,
      verified.digest,
      async () => ({ ...verified, digest: '5'.repeat(44) }),
    )).rejects.toMatchObject({ code: 'payroll_setup_verification_failed' });
    expect(repository.create).not.toHaveBeenCalled();
  });
});
