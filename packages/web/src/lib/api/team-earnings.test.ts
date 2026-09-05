import { describe, expect, it } from 'vitest';
import type { PayrollConfigurationView, SalaryStreamView } from '@tali/shared';
import { accruedAt } from '@tali/shared';

import { loadTeamEarnings, teamAccruedAt } from './team-earnings';

function configuration(
  mandateId: string,
  employee: string,
  role: 'employer' | 'employee' = 'employer',
): PayrollConfigurationView {
  return {
    mandateId,
    packageId: '0xpackage',
    coinType: '0x2::sui::SUI',
    employee,
    statutoryRules: [],
    initialBudget: '0',
    maximumPerRun: '0',
    netMinimumBps: '0',
    expiryMs: 0,
    registeredAtMs: 0,
    role,
  } as unknown as PayrollConfigurationView;
}

function stream(overrides: Partial<SalaryStreamView> = {}): SalaryStreamView {
  return {
    id: '0xstream',
    mandateId: '0xmandate-a',
    employee: '0xworker-a',
    totalAmount: '3000000000',
    startedAtMs: 0,
    endsAtMs: 1_000,
    withdrawn: '0',
    accrued: '0',
    available: '0',
    ...overrides,
  } as SalaryStreamView;
}

const json = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

/** A fetch stub that answers by path fragment rather than by call order. */
function router(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: string) => {
    const match = Object.keys(routes).find((key) => input.includes(key));
    if (!match) throw new Error(`unrouted ${input}`);
    return routes[match]!();
  }) as unknown as typeof fetch;
}

describe('loadTeamEarnings', () => {
  it('reads a live stream for each payroll the wallet employs', async () => {
    const members = await loadTeamEarnings(
      [configuration('0xmandate-a', '0xworker-a')],
      router({
        '/api/payroll/streams': () => json({ stream: { streamId: '0xstream' } }),
        '/api/streams/': () => json(stream()),
      }),
    );

    expect(members).toEqual([
      {
        mandateId: '0xmandate-a',
        employee: '0xworker-a',
        state: 'live',
        stream: stream(),
      },
    ]);
  });

  /* The employer's own next step, and the one row they must never mistake for
     an outage: opening a second stream against a mandate that already has one
     is refused by the server, and reading it wrongly wastes their time. */
  it('separates a payroll with no stream from one that could not be read', async () => {
    const unopened = await loadTeamEarnings(
      [configuration('0xmandate-a', '0xworker-a')],
      router({ '/api/payroll/streams': () => json({ stream: null }) }),
    );
    expect(unopened[0]).toMatchObject({ state: 'unopened', stream: null });

    const unreadable = await loadTeamEarnings(
      [configuration('0xmandate-a', '0xworker-a')],
      router({
        '/api/payroll/streams': () => json({ stream: { streamId: '0xstream' } }),
        '/api/streams/': () => json({ code: 'mandate_read_failed' }, false),
      }),
    );
    expect(unreadable[0]).toMatchObject({ state: 'unreadable', stream: null });
  });

  it('reports a refused registration read as unreadable rather than empty', async () => {
    const members = await loadTeamEarnings(
      [configuration('0xmandate-a', '0xworker-a')],
      router({ '/api/payroll/streams': () => json({ code: 'payroll_forbidden' }, false) }),
    );
    expect(members[0]).toMatchObject({ state: 'unreadable' });
  });

  /* A wallet that employs one team and is paid by another must not find its own
     salary among the salaries it pays. */
  it('reads only the payrolls this wallet employs', async () => {
    const members = await loadTeamEarnings(
      [
        configuration('0xmandate-a', '0xworker-a'),
        configuration('0xmandate-b', '0xthemselves', 'employee'),
      ],
      router({
        '/api/payroll/streams': () => json({ stream: null }),
      }),
    );

    expect(members).toHaveLength(1);
    expect(members[0]!.mandateId).toBe('0xmandate-a');
  });

  /* One unreachable row must not take the rest of the team down with it. */
  it('keeps the other rows when one request throws', async () => {
    const members = await loadTeamEarnings(
      [configuration('0xmandate-a', '0xworker-a'), configuration('0xmandate-b', '0xworker-b')],
      (async (input: string) => {
        if (input.includes('0xmandate-a')) throw new Error('offline');
        return json({ stream: null });
      }) as unknown as typeof fetch,
    );

    expect(members.map((member) => member.state)).toEqual(['unreadable', 'unopened']);
  });

  it('keeps the order the payrolls were listed in', async () => {
    const members = await loadTeamEarnings(
      [
        configuration('0xmandate-a', '0xworker-a'),
        configuration('0xmandate-b', '0xworker-b'),
        configuration('0xmandate-c', '0xworker-c'),
      ],
      router({ '/api/payroll/streams': () => json({ stream: null }) }),
    );

    expect(members.map((member) => member.mandateId)).toEqual([
      '0xmandate-a',
      '0xmandate-b',
      '0xmandate-c',
    ]);
  });

  it('asks for nothing when the wallet employs nobody', async () => {
    const members = await loadTeamEarnings(
      [configuration('0xmandate-b', '0xthemselves', 'employee')],
      router({}),
    );
    expect(members).toEqual([]);
  });
});

describe('teamAccruedAt', () => {
  const half = (value: SalaryStreamView) => accruedAt(value, 500);

  it('adds up what everybody has earned at one instant', () => {
    const members = [
      { mandateId: '0xa', employee: '0x1', state: 'live' as const, stream: stream() },
      {
        mandateId: '0xb',
        employee: '0x2',
        state: 'live' as const,
        stream: stream({ totalAmount: '1000000000' }),
      },
    ];
    expect(teamAccruedAt(members, half)).toBe('2000000000');
  });

  it('skips the rows with no stream rather than counting them as zero-length', () => {
    const members = [
      { mandateId: '0xa', employee: '0x1', state: 'live' as const, stream: stream() },
      { mandateId: '0xb', employee: '0x2', state: 'unopened' as const, stream: null },
    ];
    expect(teamAccruedAt(members, half)).toBe('1500000000');
  });

  it('is zero for an empty team', () => {
    expect(teamAccruedAt([], half)).toBe('0');
  });
});
