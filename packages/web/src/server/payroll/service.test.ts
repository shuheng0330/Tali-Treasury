import { describe, expect, it, vi } from 'vitest';
import type {
  LeaveRequest,
  OvertimeClaim,
  PayrollBreakdown,
  PayrollRunView,
  StatutoryBody,
} from '@tali/shared';

import { createPayrollService, type PayrollBudgetPort } from './service';
import type { PayrollPeriodSource } from './period';
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
      ], initialBudget: '1000000000', maximumPerRun: '1000000000', netMinimumBps: '7000', expiryMs: 1, registeredAtMs: 1, role: 'employer' as const,
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
      ], netMinBps: '7000', initialBudget: '1000000000', maxPerRun: '1000000000', expiryMs: '1',
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

function claim(overrides: Partial<OvertimeClaim> = {}): OvertimeClaim {
  return {
    id: 'ot-1',
    mandateId: MANDATE,
    employee: EMPLOYEE,
    workedOn: '2026-09-02',
    kind: 'normal_day',
    hours: '2',
    reason: 'release night',
    status: 'approved',
    monthlyWage: request.gross,
    pay: '100000000',
    decisionReason: null,
    decidedAtMs: 2_000,
    runId: null,
    createdAtMs: 1_000,
    ...overrides,
  };
}

function leave(deduction: string): LeaveRequest {
  return {
    id: 'lv-1',
    employee: EMPLOYEE,
    startOn: '2026-09-10',
    endOn: '2026-09-14',
    days: '4',
    kind: 'unpaid',
    reason: 'family',
    status: 'approved',
    monthlyWage: request.gross,
    deduction,
    decisionReason: null,
    decidedAtMs: 2_000,
    createdAtMs: 1_000,
  };
}

function periodSource(claims: OvertimeClaim[], requests: LeaveRequest[] = []) {
  const markOvertimePaid = vi.fn(async () => {});
  const source: PayrollPeriodSource = {
    listOvertime: vi.fn(async () => claims),
    listLeave: vi.fn(async () => requests),
    markOvertimePaid,
  };
  return { source, markOvertimePaid };
}

function bodyOf(split: { bodies: { body: StatutoryBody }[] }, name: StatutoryBody) {
  const found = split.bodies.find((entry) => entry.body === name);
  if (!found) throw new Error(`missing ${name}`);
  return found as { body: StatutoryBody; total: string; base?: string };
}

describe('createPayrollService with approved overtime and leave', () => {
  it('pays approved overtime and gives each body the base its own Act defines', async () => {
    // The whole point of the feature: RM100 of overtime raises SOCSO's and
    // EIS's base and leaves EPF's alone, because EPF Act 1991 s.2(b) puts
    // overtime outside EPF wages while Act 4 s.2(24) and Act 800 s.3 put it
    // inside theirs.
    const runs = repo();
    const { port } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      period: periodSource([claim()]).source,
      ...fx,
    });

    const source = (await service.preview(EMPLOYER, request)).fxConversion!.source;

    expect(source.baseWage).toBe('3000000000');
    expect(source.overtime).toBe('100000000');
    expect(source.gross).toBe('3100000000');
    expect(bodyOf(source, 'epf')).toMatchObject({ base: '3000000000', total: '720000000' });
    expect(bodyOf(source, 'socso')).toMatchObject({ base: '3100000000', total: '69750000' });
    expect(bodyOf(source, 'eis')).toMatchObject({ base: '3100000000', total: '12400000' });
  });

  it('submits a gross that carries the overtime, because the contract asserts net is at most gross', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      period: periodSource([claim()]).source,
      ...fx,
    });

    const preview = await service.preview(EMPLOYER, request);
    await service.run(EMPLOYER, request);

    expect(run.mock.calls[0]![0].gross).toBe(preview.gross);
    expect(BigInt(preview.gross)).toBe(775_000_000n);
  });

  it('takes approved unpaid leave off all three bases', async () => {
    const runs = repo();
    const { port } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      period: periodSource([], [leave('500000000')]).source,
      ...fx,
    });

    const source = (await service.preview(EMPLOYER, request)).fxConversion!.source;

    expect(source.unpaidLeave).toBe('500000000');
    expect(source.gross).toBe('2500000000');
    expect(bodyOf(source, 'epf').base).toBe('2500000000');
    expect(bodyOf(source, 'socso').base).toBe('2500000000');
  });

  it('marks the overtime it paid with the run that paid it', async () => {
    const runs = repo();
    const { port } = chain({ status: 'paid', digest: '0xd' });
    const { source, markOvertimePaid } = periodSource([
      claim({ id: 'ot-1', pay: '50000000' }),
      claim({ id: 'ot-2', pay: '50000000' }),
    ]);
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      period: source,
      ...fx,
    });

    await service.run(EMPLOYER, request);

    expect(markOvertimePaid).toHaveBeenCalledWith({
      employee: EMPLOYEE,
      claimIds: ['ot-1', 'ot-2'],
      runId: 'run-1',
    });
  });

  it('leaves the claims payable when the contract refuses the run', async () => {
    const runs = repo();
    const { port } = chain({ status: 'refused', abortCode: 26, message: 'no funds' });
    const { source, markOvertimePaid } = periodSource([claim()]);
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      period: source,
      ...fx,
    });

    const result = await service.run(EMPLOYER, request);

    expect(result.status).toBe('failed');
    expect(markOvertimePaid).not.toHaveBeenCalled();
  });

  it('says the money moved when the claims could not be marked paid', async () => {
    const runs = repo();
    const { port } = chain({ status: 'paid', digest: '0xdigest' });
    const { source, markOvertimePaid } = periodSource([claim()]);
    markOvertimePaid.mockRejectedValueOnce(new Error('database down'));
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      period: source,
      ...fx,
    });

    await expect(service.run(EMPLOYER, request)).rejects.toThrow('0xdigest');
    expect(runs.impl.markPaid).toHaveBeenCalled();
  });

  it('refuses before signing when overtime would drop EPF under the mandate floor', async () => {
    // EPF's contribution does not grow with overtime but the gross every floor
    // is measured against does, so past RM130.43 of overtime a lawful split
    // aborts on 24. Saying so beats broadcasting it.
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      period: periodSource([claim({ pay: '200000000' })]).source,
      ...fx,
    });

    await expect(service.run(EMPLOYER, request)).rejects.toThrow('take EPF under the mandate');
    await expect(service.run(EMPLOYER, request)).rejects.toThrow('RM 130.43 of overtime at most');
    expect(run).not.toHaveBeenCalled();
    expect(runs.impl.create).not.toHaveBeenCalled();
  });

  it('still previews the overtime it will not sign for', async () => {
    const runs = repo();
    const { port } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      period: periodSource([claim({ pay: '200000000' })]).source,
      ...fx,
    });

    await expect(service.preview(EMPLOYER, request)).resolves.toBeDefined();
  });

  it('refuses a run the mandate cannot afford instead of letting it abort', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const budget: PayrollBudgetPort = {
      read: async () => ({ spendable: 3_317_095n, maxPerRun: 1_000_000_000n }),
    };
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      budget,
      ...fx,
    });

    await expect(service.run(EMPLOYER, request)).rejects.toThrow('3.317095 USDC left');
    expect(run).not.toHaveBeenCalled();
    expect(runs.impl.create).not.toHaveBeenCalled();
  });

  it('refuses a run above the per-run limit the mandate was created with', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const budget: PayrollBudgetPort = {
      read: async () => ({ spendable: 1_000_000_000n, maxPerRun: 100_000_000n }),
    };
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      budget,
      ...fx,
    });

    await expect(service.run(EMPLOYER, request)).rejects.toThrow('allows 100.000000 USDC in one run');
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses unpaid leave larger than the wage it comes off', async () => {
    const runs = repo();
    const { port, run } = chain({ status: 'paid', digest: '0xd' });
    const service = createPayrollService({
      runs: runs.impl,
      chain: port,
      configurations: CONFIGURATIONS,
      period: periodSource([], [leave('4000000000')]).source,
      ...fx,
    });

    await expect(service.run(EMPLOYER, request)).rejects.toThrow('more than the RM 3,000.00 wage');
    expect(run).not.toHaveBeenCalled();
  });
});
