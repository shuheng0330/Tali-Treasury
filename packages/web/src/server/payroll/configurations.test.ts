import { describe, expect, it, vi } from 'vitest';

import type { PayrollConfigurationSnapshot, PayrollRegistrationRepository } from './registration';
import { createPayrollConfigurationService } from './configurations';

const employer = `0x${'a'.repeat(64)}`;
const employee = `0x${'b'.repeat(64)}`;
const outsider = `0x${'c'.repeat(64)}`;
const snapshot: PayrollConfigurationSnapshot = {
  creationDigest: '4'.repeat(44), packageId: `0x${'1'.repeat(64)}`,
  coinType: `0x${'2'.repeat(64)}::usdc::USDC`, mandateId: `0x${'3'.repeat(64)}`,
  capId: `0x${'4'.repeat(64)}`, employerWallet: employer, capOwnerWallet: `0x${'5'.repeat(64)}`,
  approvedEmployees: [employee],
  statutoryTerms: [
    { recipient: `0x${'6'.repeat(64)}`, minBps: '2300', wageCap: '0' },
    { recipient: `0x${'7'.repeat(64)}`, minBps: '225', wageCap: '6000000000' },
    { recipient: `0x${'8'.repeat(64)}`, minBps: '40', wageCap: '6000000000' },
  ],
  netMinBps: '7000', initialBudget: '100000000', maxPerRun: '10000000', expiryMs: '4102444800000', registeredAtMs: 100,
};

function repository(): PayrollRegistrationRepository {
  return {
    register: vi.fn(),
    listByEmployer: vi.fn(async () => [snapshot]),
    listByEmployee: vi.fn(async () => [snapshot]),
    findByMandateId: vi.fn(async (id) => id === snapshot.mandateId ? snapshot : null),
  };
}

describe('registered payroll access', () => {
  it('projects capability-free employer and employee views', async () => {
    const service = createPayrollConfigurationService({ configurations: repository(), employer });
    const employerView = (await service.list(employer))[0]!;
    const employeeView = (await service.list(employee))[0]!;
    expect(employerView).toMatchObject({ role: 'employer', employee, mandateId: snapshot.mandateId });
    expect(employeeView.role).toBe('employee');
    expect(employerView).not.toHaveProperty('capId');
    expect(employerView).not.toHaveProperty('capOwnerWallet');
  });

  it('fails closed for an inaccessible or unknown mandate', async () => {
    const service = createPayrollConfigurationService({ configurations: repository(), employer });
    await expect(service.requireAuthorized(outsider, snapshot.mandateId)).rejects.toMatchObject({ status: 403 });
    await expect(service.requireAuthorized(employer, `0x${'9'.repeat(64)}`)).rejects.toMatchObject({ status: 404 });
  });
});
