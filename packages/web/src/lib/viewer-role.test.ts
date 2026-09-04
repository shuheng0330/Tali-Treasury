import { describe, expect, it, vi } from 'vitest';

vi.mock('./demo-config', () => ({
  DEMO_TREASURER: '0xTREASURER',
  EMPLOYER_WALLET: '0xEMPLOYER',
  SINGLE_WALLET_DEMO: false,
}));

const { viewerRole } = await import('./viewer-role');

describe('viewerRole', () => {
  it('labels nobody when there is no address', () => {
    expect(viewerRole(null)).toBeNull();
  });

  it('matches the configured treasurer regardless of case', () => {
    expect(viewerRole('0xTREASURER')).toBe('treasurer');
    expect(viewerRole('0xtreasurer')).toBe('treasurer');
  });

  it('matches the configured employer regardless of case', () => {
    expect(viewerRole('0xEMPLOYER')).toBe('employer');
    expect(viewerRole('0xemployer')).toBe('employer');
  });

  it('falls back to member for any other signed-in wallet', () => {
    expect(viewerRole('0xsomeoneelse')).toBe('member');
  });

  it('prefers the event treasurer over the build-time constant', () => {
    expect(viewerRole('0xFROMEVENT', '0xfromevent')).toBe('treasurer');
    /* The constant is stale the moment an event names somebody else, so the
       wallet it points at is only a member of that event. */
    expect(viewerRole('0xTREASURER', '0xfromevent')).toBe('member');
  });

  it('falls back to the constant when no event has been read', () => {
    expect(viewerRole('0xTREASURER', null)).toBe('treasurer');
    expect(viewerRole('0xTREASURER', '   ')).toBe('treasurer');
  });
});
