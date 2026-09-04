import type { Address } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../errors';
import {
  createRegisterPayrollService,
  type PayrollConfigurationSnapshot,
  type PayrollRegistrationRepository,
  type PayrollRegistrationVerifier,
} from './registration';

const employer = `0x${'a'.repeat(64)}` as Address;
const digest = '4'.repeat(44);
const snapshot: PayrollConfigurationSnapshot = {
  creationDigest: digest,
  packageId: `0x${'1'.repeat(64)}`,
  coinType: `0x${'2'.repeat(64)}::usdc::USDC`,
  mandateId: `0x${'3'.repeat(64)}`,
  capId: `0x${'4'.repeat(64)}`,
  employerWallet: employer,
  capOwnerWallet: `0x${'5'.repeat(64)}`,
  approvedEmployees: [`0x${'6'.repeat(64)}`],
  statutoryTerms: [
    { recipient: `0x${'7'.repeat(64)}`, minBps: '2300', wageCap: '0' },
    { recipient: `0x${'8'.repeat(64)}`, minBps: '225', wageCap: '6000000000' },
    { recipient: `0x${'9'.repeat(64)}`, minBps: '40', wageCap: '6000000000' },
  ],
  netMinBps: '7000',
  initialBudget: '100000000000',
  maxPerRun: '10000000000',
  expiryMs: '4102444800000',
};

function verifier(overrides: Partial<PayrollRegistrationVerifier> = {}): PayrollRegistrationVerifier {
  return { verify: vi.fn(async () => snapshot), ...overrides };
}

function repository(
  overrides: Partial<PayrollRegistrationRepository> = {},
): PayrollRegistrationRepository {
  return {
    register: vi.fn(async () => ({ configuration: snapshot, created: true })),
    ...overrides,
  };
}

describe('createRegisterPayrollService', () => {
  it('verifies and persists a funded payroll transaction', async () => {
    const chain = verifier();
    const configurations = repository();
    const register = createRegisterPayrollService({ chain, configurations });

    await expect(register({ actor: employer, request: { digest } })).resolves.toEqual({
      created: true,
      response: {
        status: 'registered',
        mandateId: snapshot.mandateId,
        capId: snapshot.capId,
      },
    });
    expect(chain.verify).toHaveBeenCalledWith({ digest, employer });
    expect(configurations.register).toHaveBeenCalledWith(snapshot);
  });

  it.each(['', '0x1234', 'O'.repeat(44), '4'.repeat(31), '4'.repeat(65)])(
    'rejects invalid digest %j before querying Sui',
    async (invalidDigest) => {
      const chain = verifier();
      const configurations = repository();
      const register = createRegisterPayrollService({ chain, configurations });

      await expect(
        register({ actor: employer, request: { digest: invalidDigest } }),
      ).rejects.toMatchObject({ code: 'invalid_request', status: 400 });
      expect(chain.verify).not.toHaveBeenCalled();
      expect(configurations.register).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed request objects before querying Sui', async () => {
    const chain = verifier();
    const register = createRegisterPayrollService({ chain, configurations: repository() });
    await expect(register({ actor: employer, request: { digest, extra: true } })).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
    expect(chain.verify).not.toHaveBeenCalled();
  });

  it('reports exact replay from the repository without changing the response', async () => {
    const configurations = repository({
      register: vi.fn(async () => ({ configuration: snapshot, created: false })),
    });
    const register = createRegisterPayrollService({ chain: verifier(), configurations });
    await expect(register({ actor: employer, request: { digest } })).resolves.toMatchObject({
      created: false,
      response: { status: 'registered' },
    });
  });

  it('preserves sanitized verifier and repository errors', async () => {
    const expected = new ServerError(
      'payroll_registration_refused',
      422,
      'The transaction does not create a supported payroll',
    );
    const register = createRegisterPayrollService({
      chain: verifier({ verify: vi.fn(async () => { throw expected; }) }),
      configurations: repository(),
    });
    await expect(register({ actor: employer, request: { digest } })).rejects.toBe(expected);
  });

  it('sanitizes unexpected verifier errors', async () => {
    const register = createRegisterPayrollService({
      chain: verifier({ verify: vi.fn(async () => { throw new Error('private RPC details'); }) }),
      configurations: repository(),
    });
    const error = await register({ actor: employer, request: { digest } }).catch((value) => value);
    expect(error).toMatchObject({ code: 'payroll_registration_failed', status: 502 });
    expect((error as Error).message).not.toContain('private RPC details');
  });
});
