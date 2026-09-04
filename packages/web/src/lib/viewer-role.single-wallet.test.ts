import { describe, expect, it, vi } from 'vitest';

vi.mock('./demo-config', () => ({
  DEMO_TREASURER: '0xTREASURER',
  DEMO_EMPLOYER: '0xEMPLOYER',
  SINGLE_WALLET_DEMO: true,
}));

const { viewerRole } = await import('./viewer-role');

describe('viewerRole with a single demo wallet', () => {
  it('treats any signed-in wallet as the treasurer, even a stale-constant mismatch', () => {
    expect(viewerRole('0xwhicheverwalletsignedin')).toBe('treasurer');
  });

  it('still labels nobody when there is no address', () => {
    expect(viewerRole(null)).toBeNull();
  });
});
