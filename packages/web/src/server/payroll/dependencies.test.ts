import { describe, expect, it } from 'vitest';

import { payrollIsLive } from './dependencies';
import { streamsAreLive } from '../streams/dependencies';
import type { EnvLike } from '../env';

const complete: EnvLike = {
  AGENT_PRIVATE_KEY: 'suiprivkey1abc',
  PAYROLL_PACKAGE_ID: '0x6',
  PAYROLL_CAP_ID: '0x1',
  PAYROLL_MANDATE_ID: '0x2',
  PAYROLL_EPF_ADDRESS: '0x3',
  PAYROLL_SOCSO_ADDRESS: '0x4',
  PAYROLL_EIS_ADDRESS: '0x5',
};

describe('payrollIsLive', () => {
  it('is true only when everything a run needs is present', () => {
    expect(payrollIsLive(complete)).toBe(true);
    expect(payrollIsLive({})).toBe(false);
  });

  it('stays false while any single piece is missing', () => {
    // A half-configured mandate must not sign. Paying a wage while one of the
    // statutory recipients is unset is exactly the failure this whole module
    // exists to make impossible.
    for (const key of Object.keys(complete)) {
      const partial = { ...complete };
      delete partial[key];
      expect(payrollIsLive(partial), `${key} missing`).toBe(false);
    }
  });

  it('treats blank and whitespace-only values as unset', () => {
    expect(payrollIsLive({ ...complete, PAYROLL_EIS_ADDRESS: '   ' })).toBe(false);
    expect(payrollIsLive({ ...complete, AGENT_PRIVATE_KEY: '' })).toBe(false);
  });
});

describe('streamsAreLive', () => {
  const configured: EnvLike = {
    AGENT_PRIVATE_KEY: 'suiprivkey1abc',
    PAYROLL_PACKAGE_ID: '0x6',
    DEMO_STREAM_ID: '0x7',
  };

  it('needs both a published stream and a signer', () => {
    expect(streamsAreLive(configured)).toBe(true);
    expect(streamsAreLive({ ...configured, AGENT_PRIVATE_KEY: '' })).toBe(false);
    expect(streamsAreLive({ ...configured, DEMO_STREAM_ID: '' })).toBe(false);
    expect(streamsAreLive({ ...configured, PAYROLL_PACKAGE_ID: '' })).toBe(false);
  });

  it('accepts the public stream id when only that one is set', () => {
    const { DEMO_STREAM_ID: _unused, ...rest } = configured;
    expect(streamsAreLive({ ...rest, NEXT_PUBLIC_DEMO_STREAM_ID: '0x7' })).toBe(true);
  });
});
