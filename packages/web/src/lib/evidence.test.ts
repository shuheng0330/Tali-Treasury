import { describe, expect, it } from 'vitest';

import { ON_CHAIN_RUNS, RUN_TALLY } from './evidence';

/** Base58 as Sui encodes a 32-byte digest: no zero, capital O, capital I or lowercase L. */
const DIGEST = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

describe('ON_CHAIN_RUNS', () => {
  it('carries every digest the submission pack records', () => {
    expect(ON_CHAIN_RUNS).toHaveLength(7);
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
  it('matches the submission pack on every locally declared digest', () => {
    const declared = ON_CHAIN_RUNS.map((run) => run.digest);
    expect(declared).toContain('J6fWBNa7RQXiLaVVK4ZhZSNphggNLq312HKRyhRbZQq');
    expect(declared).toContain('86914sL2wFj9s7sfcMqdYx9ekST8FRU8Y1tLT5SAaSfN');
    /* docs/PAYROLL_TESTNET_EVIDENCE.md — the run and the refusal that prove the
       headline, against the funded payroll mandate rather than the expense one. */
    expect(declared).toContain('HpUwPspN9QgoXBmLARh8iJDFSxEACSwZNxhzz3zXr27y');
    expect(declared).toContain('Hqw44T6qTsQKW5ooPGM8BQmN6uNgaXk6TYNvw9tgFT8V');
  });

  /* The one the whole pitch turns on: a run refused for underpaying EPF, which
     is a different abort from the expense mandate's cap and allowlist checks. */
  it('records the deficient-EPF refusal on abort 24', () => {
    const run = ON_CHAIN_RUNS.find(
      (r) => r.digest === 'Hqw44T6qTsQKW5ooPGM8BQmN6uNgaXk6TYNvw9tgFT8V',
    );
    expect(run?.kind).toBe('refused');
    expect(run?.abort?.code).toBe(24);
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
    expect(RUN_TALLY.allowed).toBe(3);
    expect(RUN_TALLY.refused).toBe(3);
    expect(RUN_TALLY.allowed + RUN_TALLY.refused).toBeLessThan(RUN_TALLY.total);
  });
});
