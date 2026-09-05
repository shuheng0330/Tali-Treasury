import { beforeEach, describe, expect, it, vi } from 'vitest';

const employer = `0x${'a'.repeat(64)}`;
const employee = `0x${'b'.repeat(64)}`;
const mandateId = `0x${'2'.repeat(64)}`;
const streamId = `0x${'1'.repeat(64)}`;

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  read: vi.fn(),
}));

vi.mock('../../../../server/auth/session', () => ({
  resolveWalletIdentity: vi.fn(async () => ({ address: employer })),
}));
vi.mock('../../../../server/dependencies', () => ({
  getBackendServices: vi.fn(() => ({
    auth: {},
    payrollConfigurations: { requireAuthorized: mocks.authorize },
  })),
}));
vi.mock('../../../../server/streams/dependencies', () => ({
  streamsAreLive: vi.fn(() => true),
  getStreamService: vi.fn(() => ({ read: mocks.read })),
}));

import { GET } from './route';

describe('registered salary stream reads', () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.read.mockReset();
    mocks.authorize.mockImplementation(async (_actor, selectedMandate, requiredRole) => {
      if (requiredRole !== undefined) throw new Error('read incorrectly requires employee role');
      return {
        view: { mandateId: selectedMandate, packageId: `0x${'3'.repeat(64)}`, employee },
      };
    });
    mocks.read.mockResolvedValue({
      id: streamId,
      mandateId,
      employee,
      totalAmount: '1000000',
      startedAtMs: 1,
      endsAtMs: 2,
      withdrawn: '0',
      accrued: '1000000',
      available: '1000000',
    });
  });

  it('lets an authorized employer inspect employee accrual without granting withdrawal', async () => {
    const response = await GET(
      new Request(`http://localhost:3000/api/streams/${streamId}?payroll=${mandateId}`),
      { params: Promise.resolve({ id: streamId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith(employer, mandateId);
    expect(mocks.read).toHaveBeenCalledWith(streamId);
  });
});
