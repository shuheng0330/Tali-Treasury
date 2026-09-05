import { describe, expect, it, vi } from 'vitest';

import { createSalaryStreamOpeningService, type SalaryStreamRecord } from './opening';

const mandateId = `0x${'1'.repeat(64)}`;
const packageId = `0x${'2'.repeat(64)}`;
const capId = `0x${'3'.repeat(64)}`;
const employer = `0x${'4'.repeat(64)}`;
const employee = `0x${'5'.repeat(64)}`;
const streamId = `0x${'6'.repeat(64)}`;
const digest = '7'.repeat(44);

function configuration() {
  return {
    role: 'employer' as const,
    snapshot: {
      mandateId,
      packageId,
      capId,
      capOwnerWallet: employer,
      maxPerRun: '5000000',
      expiryMs: '2000000000000',
    },
    view: { employee },
  };
}

describe('salary stream opening service', () => {
  it('uses the registered employee and persists the confirmed stream', async () => {
    const create = vi.fn(async (stream: SalaryStreamRecord) => stream);
    const open = vi.fn(async () => ({ status: 'opened' as const, digest, streamId }));
    const requireAuthorized = vi.fn(async () => configuration());
    const service = createSalaryStreamOpeningService({
      configurations: { requireAuthorized } as never,
      streams: { findByMandateId: vi.fn(async () => null), create },
      chain: { open },
      now: () => 1_900_000_000_000,
    });

    const result = await service.open(employer, {
      mandateId,
      totalAmount: '1000000',
      durationMinutes: 10,
    });

    expect(requireAuthorized).toHaveBeenCalledWith(employer, mandateId, 'employer');
    expect(open).toHaveBeenCalledWith(expect.objectContaining({
      employee,
      totalAmount: '1000000',
      startedAtMs: 1_900_000_000_000,
      endsAtMs: 1_900_000_600_000,
    }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ streamId, creationDigest: digest }));
    expect(result.streamId).toBe(streamId);
  });

  it('does not sign a second stream for the same payroll', async () => {
    const open = vi.fn();
    const service = createSalaryStreamOpeningService({
      configurations: { requireAuthorized: vi.fn(async () => configuration()) } as never,
      streams: {
        findByMandateId: vi.fn(async () => ({ mandateId } as SalaryStreamRecord)),
        create: vi.fn(),
      },
      chain: { open },
    });

    await expect(service.open(employer, { mandateId, totalAmount: '1', durationMinutes: 5 }))
      .rejects.toMatchObject({ code: 'stream_already_exists', status: 409 });
    expect(open).not.toHaveBeenCalled();
  });

  it('rejects periods beyond the immutable mandate expiry before signing', async () => {
    const open = vi.fn();
    const current = configuration();
    current.snapshot.expiryMs = '1900000001000';
    const service = createSalaryStreamOpeningService({
      configurations: { requireAuthorized: vi.fn(async () => current) } as never,
      streams: { findByMandateId: vi.fn(async () => null), create: vi.fn() },
      chain: { open },
      now: () => 1_900_000_000_000,
    });

    await expect(service.open(employer, { mandateId, totalAmount: '1', durationMinutes: 5 }))
      .rejects.toMatchObject({ code: 'invalid_request', status: 400 });
    expect(open).not.toHaveBeenCalled();
  });

  it('does not describe a confirmed but unrecorded stream as failed', async () => {
    const service = createSalaryStreamOpeningService({
      configurations: { requireAuthorized: vi.fn(async () => configuration()) } as never,
      streams: {
        findByMandateId: vi.fn(async () => null),
        create: vi.fn(async () => { throw new Error('database unavailable'); }),
      },
      chain: { open: vi.fn(async () => ({ status: 'opened' as const, digest, streamId })) },
      now: () => 1_900_000_000_000,
    });

    await expect(service.open(employer, { mandateId, totalAmount: '1', durationMinutes: 5 }))
      .rejects.toMatchObject({
        code: 'payment_submission_uncertain',
        status: 502,
        message: expect.stringContaining(digest),
      });
  });
});
