import { describe, expect, it, vi } from 'vitest';

vi.mock('./demo-config', () => ({
  DEMO_TREASURER: '0xTREASURER',
  EMPLOYER_WALLET: '0xEMPLOYER',
  SINGLE_WALLET_DEMO: false,
}));

const { viewerRole, viewerRoles } = await import('./viewer-role');

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

describe('viewerRoles', () => {
  it('holds nothing when there is no address', () => {
    expect(viewerRoles(null).size).toBe(0);
  });

  it('makes every signed-in wallet a member', () => {
    expect([...viewerRoles('0xsomeoneelse')]).toEqual(['member']);
  });

  it('keeps both roles when one wallet is employer and treasurer', () => {
    const held = viewerRoles('0xBOTH', { eventTreasurer: '0xboth' });
    expect(held.has('treasurer')).toBe(true);
    expect(held.has('member')).toBe(true);

    const employerToo = viewerRoles('0xEMPLOYER', { eventTreasurer: '0xemployer' });
    expect([...employerToo].sort()).toEqual(['employer', 'member', 'treasurer']);
  });

  it('recognises the employee only when one has been supplied', () => {
    expect(viewerRoles('0xWORKER').has('employee')).toBe(false);
    expect(viewerRoles('0xWORKER', { employee: '0xworker' }).has('employee')).toBe(true);
  });

  /* An unset employee address must not make every wallet the employee, which is
     what a plain equality check on two empty strings would do. */
  it('grants nothing on an unconfigured address', () => {
    expect(viewerRoles('0xWORKER', { employee: '' }).has('employee')).toBe(false);
    expect(viewerRoles('0xWORKER', { employee: null }).has('employee')).toBe(false);
    expect(viewerRoles('0xWORKER', { employee: '   ' }).has('employee')).toBe(false);
  });

  it('matches addresses regardless of case or surrounding space', () => {
    expect(viewerRoles(' 0xemployer ').has('employer')).toBe(true);
  });
});
