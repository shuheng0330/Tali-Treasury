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
  it('is true when the signer is available for registered configurations', () => {
    expect(payrollIsLive(complete)).toBe(true);
    expect(payrollIsLive({})).toBe(false);
  });

  it('does not depend on global mandate, cap, package or recipient ids', () => {
    expect(payrollIsLive({ AGENT_PRIVATE_KEY: complete.AGENT_PRIVATE_KEY })).toBe(true);
  });

  it('treats blank and whitespace-only values as unset', () => {
    expect(payrollIsLive({ ...complete, AGENT_PRIVATE_KEY: '' })).toBe(false);
  });
});

describe('streamsAreLive', () => {
  const configured: EnvLike = { AGENT_PRIVATE_KEY: 'suiprivkey1abc' };

  it('needs the signer used for registered stream withdrawals', () => {
    expect(streamsAreLive(configured)).toBe(true);
    expect(streamsAreLive({ ...configured, AGENT_PRIVATE_KEY: '' })).toBe(false);
  });

  it('does not depend on a global stream or package id', () => {
    expect(streamsAreLive({
      ...configured,
      DEMO_STREAM_ID: '',
      NEXT_PUBLIC_DEMO_STREAM_ID: '',
      PAYROLL_PACKAGE_ID: '',
    })).toBe(true);
  });
});
