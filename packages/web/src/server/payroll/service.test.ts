import { describe, expect, it, vi } from 'vitest';
import type { PayrollBreakdown, PayrollRunView } from '@tali/shared';

import { createPayrollService } from './service';
import type { PayrollChainPort, PayrollRunRepository, PayrollSubmission } from './ports';
import type { PayrollRequest } from './validation';

const EMPLOYER = `0x${'a'.repeat(64)}`;
const EMPLOYEE = `0x${'b'.repeat(64)}`;
const MANDATE = `0x${'3'.repeat(64)}`;
const RECIPIENTS = {
  epf: `0x${'4'.repeat(64)}`,
  socso: `0x${'5'.repeat(64)}`,
  eis: `0x${'6'.repeat(64)}`,
} as const;
const RATE = { myrPerUsd: '4', rateTimestampMs: 1_000, fetchedAtMs: 2_000 };

const request: PayrollRequest = {
  mandateId: MANDATE,
  gross: '3000000000',
  age: 30,
  citizenship: 'local',
  fxApproval: { myrPerUsd: RATE.myrPerUsd, rateTimestampMs: RATE.rateTimestampMs },
};

const fx = { rates: async () => RATE, now: () => 3_000 };
const CONFIGURATIONS = {
  list: vi.fn(),
  requireAuthorized: vi.fn(async () => ({
    role: 'employer' as const,
    view: {
      mandateId: MANDATE, packageId: `0x${'1'.repeat(64)}`, coinType: 'coin', employee: EMPLOYEE,
      statutoryRules: [
        { body: 'epf' as const, recipient: RECIPIENTS.epf, minBps: '2300', wageCap: '0' },
        { body: 'socso' as const, recipient: RECIPIENTS.socso, minBps: '225', wageCap: '0' },
        { body: 'eis' as const, recipient: RECIPIENTS.eis, minBps: '40', wageCap: '0' },
      ], initialBudget: '1', maximumPerRun: '1', netMinimumBps: '7000', expiryMs: 1, registeredAtMs: 1, role: 'employer' as const,
    },
    snapshot: {
      creationDigest: '4'.repeat(44), mandateId: MANDATE, packageId: `0x${'1'.repeat(64)}`,
      coinType: 'coin::usdc::USDC', capId: `0x${'2'.repeat(64)}`,
      employerWallet: EMPLOYER, capOwnerWallet: `0x${'9'.repeat(64)}`,
      approvedEmployees: [EMPLOYEE],
      statutoryTerms: [
        { recipient: RECIPIENTS.epf, minBps: '2300', wageCap: '0' },
        { recipient: RECIPIENTS.socso, minBps: '225', wageCap: '0' },
        { recipient: RECIPIENTS.eis, minBps: '40', wageCap: '0' },
      ], netMinBps: '7000', initialBudget: '1', maxPerRun: '1', expiryMs: '1',
    },
  })),
};

function repo() {
  const runs: PayrollRunView[] = [];
  const impl: PayrollRunRepository = {
    create: vi.fn(async ({ mandateId, employee, breakdown }) => {
      const view: PayrollRunView = {
        id: `run-${runs.length + 1}`,
        mandateId: mandateId as PayrollRunView['mandateId'],
        employee,
        breakdown: breakdown as PayrollBreakdown,
        status: 'pending',
        digest: null,
        abortCode: null,
        createdAtMs: 0,
      };
      runs.push(view);
      return view;
    }),
    markPaid: vi.fn(async (id, digest) => ({
      ...runs.find((r) => r.id === id)!,
      status: 'paid' as const,
      digest,
    })),
    markFailed: vi.fn(async (id, abortCode, digest) => ({
      ...runs.find((r) => r.id === id)!,
      status: 'failed' as const,
      abortCode,
      digest: digest ?? null,
    })),
    listRecent: vi.fn(async () => runs),
    listRecentForMandate: vi.fn(async () => runs),
  };
  return { impl, runs };
}

function chain(submission: PayrollSubmission, ready = true) {
  const run = vi.fn(
    async (_input: Parameters<PayrollChainPort['run']>[0]) => submission,
  );
  const port: PayrollChainPort = {
    assertReady: () => {
      if (!ready) throw new Error('payroll module is not configured');
    },
    run,
  };
  return { port, run };
}

describe('createPayrollService', () => {
  it('previews without touching the chain or the database', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({ runs: runs.impl, chain: port, configurations: CONFIGURATIONS, ...fx });

    const breakdown = await service.preview(EMPLOYER, request);

    expect(breakdown.recipients).toEqual(RECIPIENTS);
    expect(breakdown.employee).toBe(EMPLOYEE);
    expect(run).not.toHaveBeenCalled();
    expect(runs.impl.create).not.toHaveBeenCalled();
  });

  it('records the run before submitting it', async () => {
    const runs = repo();
    const { port } = chain({ status: 'paid', digest: '0xdigest' });
    const service = createPayrollService({ runs: runs.impl, chain: port, configurations: CONFIGURATIONS, ...fx });

    const result = await service.run(EMPLOYER, request);

    expect(runs.impl.create).toHaveBeenCalledOnce();
    expect(runs.impl.create).toHaveBeenCalledWith(expect.objectContaining({ mandateId: MANDATE, employee: EMPLOYEE }));
    expect(result.status).toBe('paid');
    expect(result.digest).toBe('0xdigest');
  });

  it('sends the three statutory amounts in the order the contract expects', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({ runs: runs.impl, chain: port, configurations: CONFIGURATIONS, ...fx });

    await service.run(EMPLOYER, request);

    const sent = run.mock.calls[0]![0];
    expect(sent).toMatchObject({ mandateId: MANDATE, employee: EMPLOYEE, packageId: `0x${'1'.repeat(64)}` });
    const preview = await service.preview(EMPLOYER, request);
    expect(sent.statutoryAmounts).toEqual(preview.bodies.map((b) => b.total));
  });

  it('sends one base unit for the body the caller asked to underpay', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'refused', abortCode: 24, message: 'short' });
    const service = createPayrollService({ runs: runs.impl, chain: port, configurations: CONFIGURATIONS, ...fx });

    await service.run(EMPLOYER, { ...request, underpay: 'epf' });

    const sent = run.mock.calls[0]![0];
    expect(sent.statutoryAmounts[0]).toBe('1');
    expect(sent.statutoryAmounts[1]).not.toBe('1');
    expect(sent.recordRefusal).toBe(true);
  });

  it('records a refusal with its abort code instead of throwing', async () => {
    const runs = repo();
    const { port } = chain({ status: 'refused', abortCode: 24, message: 'statutory short' });
    const service = createPayrollService({ runs: runs.impl, chain: port, configurations: CONFIGURATIONS, ...fx });

    const result = await service.run(EMPLOYER, { ...request, underpay: 'epf' });

    expect(result.status).toBe('failed');
    expect(result.abortCode).toBe(24);
    expect(runs.impl.markPaid).not.toHaveBeenCalled();
  });

  it('never retries a submission', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'refused', abortCode: 26, message: 'no funds' });
    const service = createPayrollService({ runs: runs.impl, chain: port, configurations: CONFIGURATIONS, ...fx });

    await service.run(EMPLOYER, request);

    expect(run).toHaveBeenCalledOnce();
  });

  it('refuses a worker class this mandate was not written for', async () => {
    // The floors describe staff under 60. A correct split for anyone else is
    // refused on abort 24, which blames the arithmetic for a mismatch in who
    // the mandate covers.
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({ runs: runs.impl, chain: port, configurations: CONFIGURATIONS, ...fx });

    await expect(service.run(EMPLOYER, { ...request, age: 61 })).rejects.toThrow('under 60');
    await expect(service.run(EMPLOYER, { ...request, citizenship: 'foreign' })).rejects.toThrow(
      'its own mandate',
    );

    expect(run).not.toHaveBeenCalled();
    expect(runs.impl.create).not.toHaveBeenCalled();
  });

  it('still previews any worker class, because the arithmetic is not in doubt', async () => {
    const runs = repo();
    const { port } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({ runs: runs.impl, chain: port, configurations: CONFIGURATIONS, ...fx });

    await expect(service.preview(EMPLOYER, { ...request, age: 61 })).resolves.toBeDefined();
  });

  it('refuses to run at all when the payroll module is not configured', async () => {
    const runs = repo();
    const { port } = chain({ status: 'paid', digest: '0xd' }, false);
    const service = createPayrollService({ runs: runs.impl, chain: port, configurations: CONFIGURATIONS, ...fx });

    await expect(service.run(EMPLOYER, request)).rejects.toThrow('not configured');
    expect(runs.impl.create).not.toHaveBeenCalled();
  });

  it('stores the digest of an on-chain refusal', async () => {
    const runs = repo();
    const { port } = chain({
      status: 'refused',
      abortCode: 24,
      message: 'statutory short',
      digest: '0xfailed',
    });
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      ...fx,
    });

    const result = await service.run(EMPLOYER, { ...request, underpay: 'epf' });

    expect(runs.impl.markFailed).toHaveBeenCalledWith('run-1', 24, '0xfailed');
    expect(result.digest).toBe('0xfailed');
  });

  it('requires the run to approve the exact rate shown by preview', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({ runs: runs.impl, chain: port, configurations: CONFIGURATIONS, ...fx });

    await expect(service.run(EMPLOYER, { ...request, fxApproval: undefined })).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.run(EMPLOYER, {
      ...request,
      fxApproval: { ...request.fxApproval!, myrPerUsd: '4.1' },
    })).rejects.toMatchObject({ status: 409 });
    expect(run).not.toHaveBeenCalled();
    expect(runs.impl.create).not.toHaveBeenCalled();
  });
});
