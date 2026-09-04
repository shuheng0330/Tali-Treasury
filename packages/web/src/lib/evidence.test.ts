import { describe, expect, it } from 'vitest';

import { ON_CHAIN_RUNS, RUN_TALLY } from './evidence';

/** Base58 as Sui encodes a 32-byte digest: no zero, capital O, capital I or lowercase L. */
const DIGEST = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

describe('ON_CHAIN_RUNS', () => {
  it('carries every digest the submission pack records', () => {
    expect(ON_CHAIN_RUNS).toHaveLength(5);
  });

  it('never lists the same transaction twice', () => {
    const digests = ON_CHAIN_RUNS.map((run) => run.digest);
    expect(new Set(digests).size).toBe(digests.length);
  });

  it('holds digests an explorer can resolve', () => {
    for (const run of ON_CHAIN_RUNS) {
      expect(run.digest, run.headline).toMatch(DIGEST);
    }
  });

  /* These two are typed out here rather than read from `taliUsdcDemo`, so a
     transcription slip would put a digest on the landing page that resolves to
     nothing — or to somebody else's transaction. */
  it('matches docs/SUBMISSION.md on the two locally declared digests', () => {
    const declared = ON_CHAIN_RUNS.map((run) => run.digest);
    expect(declared).toContain('J6fWBNa7RQXiLaVVK4ZhZSNphggNLq312HKRyhRbZQq');
    expect(declared).toContain('86914sL2wFj9s7sfcMqdYx9ekST8FRU8Y1tLT5SAaSfN');
  });

  it('gives an abort code to every refusal and to nothing else', () => {
    for (const run of ON_CHAIN_RUNS) {
      if (run.kind === 'refused') {
        expect(run.abort, run.headline).not.toBeNull();
      } else {
        expect(run.abort, run.headline).toBeNull();
      }
    }
  });

  it('keeps the publish out of the allowed and refused verdicts', () => {
    const published = ON_CHAIN_RUNS.filter((run) => run.kind === 'published');
    expect(published).toHaveLength(1);
    expect(published[0]!.digest).toBe('86914sL2wFj9s7sfcMqdYx9ekST8FRU8Y1tLT5SAaSfN');
  });
});

describe('RUN_TALLY', () => {
  it('counts what the landing copy says it counts', () => {
    expect(RUN_TALLY.total).toBe(ON_CHAIN_RUNS.length);
    expect(RUN_TALLY.allowed).toBe(2);
    expect(RUN_TALLY.refused).toBe(2);
    expect(RUN_TALLY.allowed + RUN_TALLY.refused).toBeLessThan(RUN_TALLY.total);
  });
});
