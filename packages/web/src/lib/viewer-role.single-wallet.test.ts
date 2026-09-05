import { describe, expect, it, vi } from 'vitest';

vi.mock('./demo-config', () => ({
  DEMO_TREASURER: '0xTREASURER',
  EMPLOYER_WALLET: '0xEMPLOYER',
  PAYROLL_EMPLOYEE: '0xWORKER',
  SINGLE_WALLET_DEMO: true,
}));

const { viewerRole } = await import('./viewer-role');

describe('viewerRole with a single demo wallet', () => {
  it('labels the configured employee as employee in single-wallet demo mode', () => {
    expect(viewerRole('0xWORKER')).toBe('employee');
  });

  it('labels the configured employer as employer in single-wallet demo mode', () => {
    expect(viewerRole('0xEMPLOYER')).toBe('employer');
  });

  it('keeps a treasurer fallback for an unknown demo wallet', () => {
    expect(viewerRole('0xwhicheverwalletsignedin')).toBe('treasurer');
  });

  it('still labels nobody when there is no address', () => {
    expect(viewerRole(null)).toBeNull();
  });
});
