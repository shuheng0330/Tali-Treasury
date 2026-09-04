import { describe, expect, it } from 'vitest';

import {
  epfFloorNote,
  payrollRunNote,
  payrollStage,
  streamFallbackReason,
} from './chain-status';

const PACKAGE = '0xeb973dbac9e4e5c2ea0c31ffb6b51b4df1f34e05443f970e89a35301e6b97688';
const MANDATE = '0x1cc1790980261111111111111111111111111111111111111111111111111111';

describe('payrollStage', () => {
  it('is unpublished with no package configured', () => {
    expect(payrollStage({})).toBe('unpublished');
    expect(payrollStage({ PAYROLL_PACKAGE_ID: '   ' })).toBe('unpublished');
  });

  /* The state we are actually in, and the one the screens used to describe as
     "not on chain yet". */
  it('is published with a package but no mandate', () => {
    expect(payrollStage({ PAYROLL_PACKAGE_ID: PACKAGE })).toBe('published');
    expect(payrollStage({ NEXT_PUBLIC_PAYROLL_PACKAGE_ID: PACKAGE })).toBe('published');
  });

  it('is mandated once a mandate is configured', () => {
    expect(payrollStage({ PAYROLL_PACKAGE_ID: PACKAGE, PAYROLL_MANDATE_ID: MANDATE })).toBe(
      'mandated',
    );
  });

  /* A mandate without the package it lives in is not a deployment anyone can
     read, so it does not get to claim the later stage. */
  it('ignores a mandate with no package', () => {
    expect(payrollStage({ PAYROLL_MANDATE_ID: MANDATE })).toBe('unpublished');
  });
});

describe('streamFallbackReason', () => {
  it('names the stream rather than the mandate', () => {
    const reason = streamFallbackReason('published', {});
    expect(reason).toContain('no salary stream has been opened');
    expect(reason).not.toContain('mandate');
  });

  it('blames the read once a stream is configured', () => {
    expect(streamFallbackReason('mandated', { DEMO_STREAM_ID: '0xstream' })).toContain(
      'could not be read',
    );
  });

  it('falls back to the module when nothing is published', () => {
    expect(streamFallbackReason('unpublished', { DEMO_STREAM_ID: '0xstream' })).toBe(
      'the payroll module is not on chain yet',
    );
  });
});

describe('payrollRunNote', () => {
  it('promises a real transaction only when runs are live', () => {
    expect(payrollRunNote('mandated', true)).toContain('real transaction');
    expect(payrollRunNote('mandated', false)).not.toContain('real transaction');
  });

  /* The specific line this change exists to remove. */
  it('does not ask for a module that is already on chain', () => {
    expect(payrollRunNote('published', false)).not.toBe(
      'Paying a run still needs the payroll module on chain.',
    );
    expect(payrollRunNote('published', false)).toContain('The module is on chain');
  });

  it('still asks for the module when there is none', () => {
    expect(payrollRunNote('unpublished', false)).toContain('needs the payroll module on chain');
  });

  /* Configured objects are not the same as a signer. */
  it('names what is missing when a mandate exists but runs are not live', () => {
    expect(payrollRunNote('mandated', false)).toContain('signer');
  });
});

describe('epfFloorNote', () => {
  it('stops claiming the module is unpublished once it is', () => {
    expect(epfFloorNote('published')).not.toContain('not published yet');
    expect(epfFloorNote('published')).toContain('published on testnet');
  });

  it('keeps the old sentence when it is still true', () => {
    expect(epfFloorNote('unpublished')).toContain('not published yet');
  });

  it('does not say a mandate is missing when one is configured', () => {
    expect(epfFloorNote('mandated')).toContain('could not be read');
  });
});
