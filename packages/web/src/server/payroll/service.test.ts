import { describe, expect, it, vi } from 'vitest';
import type { PayrollBreakdown, PayrollRunView } from '@tali/shared';

import { createPayrollService } from './service';
import type { PayrollChainPort, PayrollRunRepository, PayrollSubmission } from './ports';
import type { PayrollRequest } from './validation';

const RECIPIENTS = { epf: '0xepf', socso: '0xsocso', eis: '0xeis' } as const;
const RATE = { myrPerUsd: '4', rateTimestampMs: 1_000, fetchedAtMs: 2_000 };

const request: PayrollRequest = {
  employee: '0xworker',
  gross: '3000000000',
  age: 30,
  citizenship: 'local',
  fxApproval: { myrPerUsd: RATE.myrPerUsd, rateTimestampMs: RATE.rateTimestampMs },
};

const fx = { rates: async () => RATE, now: () => 3_000 };

function repo() {
  const runs: PayrollRunView[] = [];
  const impl: PayrollRunRepository = {
    create: vi.fn(async ({ employee, breakdown }) => {
      const view: PayrollRunView = {
        id: `run-${runs.length + 1}`,
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
    markFailed: vi.fn(async (id, abortCode) => ({
      ...runs.find((r) => r.id === id)!,
      status: 'failed' as const,
      abortCode,
    })),
    listRecent: vi.fn(async () => runs),
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
    const service = createPayrollService({ runs: runs.impl, chain: port, recipients: RECIPIENTS, ...fx });

    const breakdown = await service.preview(request);

    expect(breakdown.recipients).toEqual(RECIPIENTS);
    expect(breakdown.employee).toBe('0xworker');
    expect(run).not.toHaveBeenCalled();
    expect(runs.impl.create).not.toHaveBeenCalled();
  });

  it('records the run before submitting it', async () => {
    const runs = repo();
    const { port } = chain({ status: 'paid', digest: '0xdigest' });
    const service = createPayrollService({ runs: runs.impl, chain: port, recipients: RECIPIENTS, ...fx });

    const result = await service.run(request);

    expect(runs.impl.create).toHaveBeenCalledOnce();
    expect(result.status).toBe('paid');
    expect(result.digest).toBe('0xdigest');
  });

  it('sends the three statutory amounts in the order the contract expects', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({ runs: runs.impl, chain: port, recipients: RECIPIENTS, ...fx });

    await service.run(request);

    const sent = run.mock.calls[0]![0];
    const preview = await service.preview(request);
    expect(sent.statutoryAmounts).toEqual(preview.bodies.map((b) => b.total));
  });

  it('sends one base unit for the body the caller asked to underpay', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'refused', abortCode: 24, message: 'short' });
    const service = createPayrollService({ runs: runs.impl, chain: port, recipients: RECIPIENTS, ...fx });

    await service.run({ ...request, underpay: 'epf' });

    const sent = run.mock.calls[0]![0];
    expect(sent.statutoryAmounts[0]).toBe('1');
    expect(sent.statutoryAmounts[1]).not.toBe('1');
  });

  it('records a refusal with its abort code instead of throwing', async () => {
    const runs = repo();
    const { port } = chain({ status: 'refused', abortCode: 24, message: 'statutory short' });
    const service = createPayrollService({ runs: runs.impl, chain: port, recipients: RECIPIENTS, ...fx });

    const result = await service.run({ ...request, underpay: 'epf' });

    expect(result.status).toBe('failed');
    expect(result.abortCode).toBe(24);
    expect(runs.impl.markPaid).not.toHaveBeenCalled();
  });

  it('never retries a submission', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'refused', abortCode: 26, message: 'no funds' });
    const service = createPayrollService({ runs: runs.impl, chain: port, recipients: RECIPIENTS, ...fx });

    await service.run(request);

    expect(run).toHaveBeenCalledOnce();
  });

  it('refuses a worker class this mandate was not written for', async () => {
    // The floors describe staff under 60. A correct split for anyone else is
    // refused on abort 24, which blames the arithmetic for a mismatch in who
    // the mandate covers.
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({ runs: runs.impl, chain: port, recipients: RECIPIENTS, ...fx });

    await expect(service.run({ ...request, age: 61 })).rejects.toThrow('under 60');
    await expect(service.run({ ...request, citizenship: 'foreign' })).rejects.toThrow(
      'its own mandate',
    );

    expect(run).not.toHaveBeenCalled();
    expect(runs.impl.create).not.toHaveBeenCalled();
  });

  it('still previews any worker class, because the arithmetic is not in doubt', async () => {
    const runs = repo();
    const { port } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({ runs: runs.impl, chain: port, recipients: RECIPIENTS, ...fx });

    await expect(service.preview({ ...request, age: 61 })).resolves.toBeDefined();
  });

  it('refuses to run at all when the payroll module is not configured', async () => {
    const runs = repo();
    const { port } = chain({ status: 'paid', digest: '0xd' }, false);
    const service = createPayrollService({ runs: runs.impl, chain: port, recipients: RECIPIENTS, ...fx });

    await expect(service.run(request)).rejects.toThrow('not configured');
    expect(runs.impl.create).not.toHaveBeenCalled();
  });

  it('requires the run to approve the exact rate shown by preview', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({ runs: runs.impl, chain: port, recipients: RECIPIENTS, ...fx });

    await expect(service.run({ ...request, fxApproval: undefined })).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.run({
      ...request,
      fxApproval: { ...request.fxApproval!, myrPerUsd: '4.1' },
    })).rejects.toMatchObject({ status: 409 });
    expect(run).not.toHaveBeenCalled();
    expect(runs.impl.create).not.toHaveBeenCalled();
  });
});
