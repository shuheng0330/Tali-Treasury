import { describe, expect, it, vi } from 'vitest';

vi.mock('./demo-config', () => ({
  DEMO_TREASURER: '0xTREASURER',
  EMPLOYER_WALLET: '0xEMPLOYER',
  PAYROLL_EMPLOYEE: '',
  SINGLE_WALLET_DEMO: false,
}));

const { viewerRole, viewerRoles, can, canAny, capabilitiesOf } = await import('./viewer-role');

describe('viewerRole', () => {
  it('labels nobody when there is no address', () => {
    expect(viewerRole(null)).toBeNull();
  });

  it('matches the configured employer regardless of case', () => {
    expect(viewerRole('0xEMPLOYER')).toBe('employer');
    expect(viewerRole('0xemployer')).toBe('employer');
  });

  it('falls back to member for any other signed-in wallet', () => {
    expect(viewerRole('0xsomeoneelse')).toBe('member');
  });

  /* There is no treasurer any more: the employer creates the treasury, funds
     payroll and decides what either pays. A wallet an event happens to record
     as its treasurer is not handed the role here, because the server checks
     each action against its own authority and a second employer would be shown
     a Treasury tab with a 403 behind it. */
  it('does not make an event treasurer an employer', () => {
    expect(viewerRole('0xTREASURER')).toBe('member');
  });
});

describe('viewerRoles', () => {
  it('holds nothing when there is no address', () => {
    expect(viewerRoles(null).size).toBe(0);
  });

  it('makes every signed-in wallet a member', () => {
    expect([...viewerRoles('0xsomeoneelse')]).toEqual(['member']);
  });

  /* The employer holds this and nothing else. Membership carries `request`, so
     a union that added it back would put the three claim forms in front of the
     one person whose job is to decide them. */
  it('gives the employer wallet the employer role alone', () => {
    expect([...viewerRoles('0xEMPLOYER')]).toEqual(['employer']);
  });

  it('keeps the employer the employer even when a stream names them', () => {
    expect([...viewerRoles('0xEMPLOYER', { employee: '0xemployer' })]).toEqual(['employer']);
  });

  it('recognises the employee only when one has been supplied', () => {
    expect(viewerRoles('0xWORKER').has('employee')).toBe(false);
    expect(viewerRoles('0xWORKER', { employee: '0xworker' }).has('employee')).toBe(true);
  });

  /* A caller that read a stream and found no employee has given a real answer,
     and the configured fallback must not overrule it. Omitting the key is the
     different case, and is covered in viewer-role.single-wallet.test.ts. */
  it('treats an explicit null employee as an answer, not a missing argument', () => {
    expect(viewerRoles('0xWORKER', { employee: null }).has('employee')).toBe(false);
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

describe('capabilities', () => {
  const roles = (...values: string[]) => new Set(values as never[]);

  /* The guarantee the whole model exists for. */
  it('gives approve to the employer and to nobody else', () => {
    expect(can(roles('employer'), 'approve')).toBe(true);
    for (const role of ['employee', 'member']) {
      expect(can(roles(role), 'approve'), role).toBe(false);
    }
  });

  it('gives running payroll to the employer alone', () => {
    expect(can(roles('employer'), 'runPayroll')).toBe(true);
    for (const role of ['employee', 'member']) {
      expect(can(roles(role), 'runPayroll'), role).toBe(false);
    }
  });

  /* The employer creates the treasury and funds payroll. There is no separate
     treasurer to share it with any more. */
  it('gives the treasury to the employer alone', () => {
    expect(can(roles('employer'), 'holdTreasury')).toBe(true);
    for (const role of ['employee', 'member']) {
      expect(can(roles(role), 'holdTreasury'), role).toBe(false);
    }
  });

  /**
   * The product's whole idea is that a salary accrues by the second and you
   * withdraw what you have already earned. Gating that on one configured wallet
   * left everybody else unable to see their own pay.
   */
  it('lets everybody who is paid reach their own earnings', () => {
    for (const role of ['employee', 'member']) {
      expect(can(roles(role), 'earn'), role).toBe(true);
    }
  });

  /* The employer draws no salary from a mandate they fund, so `earn` would open
     a screen with nothing on it. They get the team's instead, and the team view
     has no withdraw control anywhere on it. */
  it('gives the employer oversight of earnings rather than earnings', () => {
    expect(can(roles('employer'), 'earn')).toBe(false);
    expect(can(roles('employer'), 'overseeEarnings')).toBe(true);
    for (const role of ['employee', 'member']) {
      expect(can(roles(role), 'overseeEarnings'), role).toBe(false);
    }
  });

  /* Asked for by teammates: the employer meets all three kinds of request in
     the approval queue, and never files one. */
  it('keeps the employer out of the request forms', () => {
    expect(can(roles('employer'), 'request')).toBe(false);
    for (const role of ['employee', 'member']) {
      expect(can(roles(role), 'request'), role).toBe(true);
    }
  });

  it('lets everybody signed in read the proofs', () => {
    for (const role of ['employer', 'employee', 'member']) {
      expect(can(roles(role), 'proof'), role).toBe(true);
    }
  });

  /* The line the table actually draws: authority over other people. */
  it('restricts only the powers held over somebody else', () => {
    for (const role of ['employee', 'member']) {
      expect(can(roles(role), 'approve'), role).toBe(false);
      expect(can(roles(role), 'runPayroll'), role).toBe(false);
      expect(can(roles(role), 'holdTreasury'), role).toBe(false);
    }
  });

  it('unions what two roles carry rather than taking the first', () => {
    const both = capabilitiesOf(roles('employee', 'member'));
    expect(both.has('earn')).toBe(true);
    expect(both.has('request')).toBe(true);
  });

  it('holds a capability when any one of several is held', () => {
    expect(canAny(roles('employer'), ['earn', 'overseeEarnings'])).toBe(true);
    expect(canAny(roles('member'), ['earn', 'overseeEarnings'])).toBe(true);
    expect(canAny(roles('member'), ['approve', 'runPayroll'])).toBe(false);
    expect(canAny(roles('member'), [])).toBe(false);
  });

  /* Every role is spelled out, so a role added later cannot silently carry
     nothing and read as a wallet with no access at all. */
  it('names a capability set for every role', () => {
    for (const role of ['employer', 'employee', 'member']) {
      expect(capabilitiesOf(roles(role)).size, role).toBeGreaterThan(0);
    }
  });

  it('gives a wallet with no roles nothing at all', () => {
    expect(capabilitiesOf(new Set()).size).toBe(0);
  });
});
