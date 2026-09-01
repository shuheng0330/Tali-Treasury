import { describe, expect, it } from 'vitest';

import { createStreamService, toSalaryStreamView } from './service';
import type { SalaryStreamState, StreamChainPort, WithdrawSubmission } from './ports';

const START = 1_760_000_000_000;
const HOUR = 3_600_000;

/** RM 3,000 in base units: the wage that breaks a per-millisecond rate. */
const MONTHLY = 3_000_000_000n;

function state(overrides: Partial<SalaryStreamState> = {}): SalaryStreamState {
  return {
    id: '0xstream',
    mandateId: '0xmandate',
    employee: '0xemployee',
    totalAmount: MONTHLY,
    startedAtMs: BigInt(START),
    endsAtMs: BigInt(START + HOUR),
    withdrawn: 0n,
    ...overrides,
  };
}

function chainReturning(
  read: SalaryStreamState,
  withdraw?: WithdrawSubmission,
): StreamChainPort {
  return {
    read: async () => read,
    withdraw: async () =>
      withdraw ?? { status: 'paid', digest: '0xdigest', amount: '1' },
  };
}

describe('toSalaryStreamView', () => {
  it('reports available as accrued minus withdrawn', () => {
    const view = toSalaryStreamView(
      state({ withdrawn: 500_000_000n }),
      START + HOUR / 2,
    );

    expect(view.accrued).toBe('1500000000');
    expect(view.available).toBe('1000000000');
  });

  it('accrues exactly half at the halfway point', () => {
    const view = toSalaryStreamView(state(), START + HOUR / 2);
    expect(view.accrued).toBe((MONTHLY / 2n).toString());
  });

  it('pays the full total at the end of the period, with nothing lost to rounding', () => {
    const view = toSalaryStreamView(state(), START + HOUR);
    expect(view.accrued).toBe(MONTHLY.toString());
  });

  it('stops accruing after the period ends', () => {
    const atEnd = toSalaryStreamView(state(), START + HOUR);
    const wellAfter = toSalaryStreamView(state(), START + HOUR * 100);
    expect(wellAfter.accrued).toBe(atEnd.accrued);
  });

  it('returns zero rather than a negative before the stream starts', () => {
    const view = toSalaryStreamView(state(), START - HOUR);
    expect(view.accrued).toBe('0');
    expect(view.available).toBe('0');
  });

  it('never reports more available than remains unwithdrawn', () => {
    const view = toSalaryStreamView(state({ withdrawn: MONTHLY }), START + HOUR);
    expect(view.available).toBe('0');
  });

  it('treats a zero-length period as nothing accrued instead of dividing by zero', () => {
    const view = toSalaryStreamView(
      state({ endsAtMs: BigInt(START) }),
      START + HOUR,
    );
    expect(view.accrued).toBe('0');
  });

  it('keeps every money field a string, never a number', () => {
    const view = toSalaryStreamView(state(), START + HOUR / 3);
    for (const field of [view.totalAmount, view.withdrawn, view.accrued, view.available]) {
      expect(typeof field).toBe('string');
    }
  });

  /* The interface computes accrual locally between chain reads. If it drifts
     from the contract the withdraw button offers an amount that aborts, in
     front of an audience. */
  it('agrees with the contract formula at every point across the period', () => {
    const total = MONTHLY;
    const duration = BigInt(HOUR);

    for (let step = 0; step <= 60; step += 1) {
      const now = START + Math.floor((HOUR * step) / 60);
      const elapsed = BigInt(now - START);
      const onChain = (total * elapsed) / duration;

      expect(toSalaryStreamView(state(), now).accrued).toBe(onChain.toString());
    }
  });

  it('does not lose value to truncation the way a per-millisecond rate would', () => {
    const view = toSalaryStreamView(state(), START + HOUR);

    /* A u64 rate would be MONTHLY / HOUR = 833333 base units per ms, and
       833333 * HOUR falls short of the total. Deriving from the total does not. */
    const truncatedRate = MONTHLY / BigInt(HOUR);
    expect(truncatedRate * BigInt(HOUR)).toBeLessThan(MONTHLY);
    expect(view.accrued).toBe(MONTHLY.toString());
  });
});

describe('createStreamService', () => {
  it('reads through the chain port at the supplied clock', async () => {
    const service = createStreamService({
      chain: chainReturning(state()),
      now: () => START + HOUR / 4,
    });

    const view = await service.read('0xstream');
    expect(view.accrued).toBe((MONTHLY / 4n).toString());
  });

  it('returns a paid withdrawal with its digest', async () => {
    const service = createStreamService({
      chain: chainReturning(state(), {
        status: 'paid',
        digest: '0xabc',
        amount: '1500000000',
      }),
      now: () => START,
    });

    const result = await service.withdraw('0xstream');
    expect(result).toEqual({ ok: true, digest: '0xabc', amount: '1500000000' });
  });

  it('surfaces a refusal as a result rather than throwing', async () => {
    const service = createStreamService({
      chain: chainReturning(state(), {
        status: 'refused',
        abortCode: 28,
        message: 'Nothing has accrued yet.',
      }),
      now: () => START,
    });

    const result = await service.withdraw('0xstream');
    expect(result).toEqual({
      ok: false,
      abortCode: 28,
      message: 'Nothing has accrued yet.',
    });
  });
});
