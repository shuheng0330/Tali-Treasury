import { describe, expect, it, vi } from 'vitest';

/* The flag is still set, and is deliberately given no say here. */
vi.mock('./demo-config', () => ({
  DEMO_TREASURER: '0xTREASURER',
  EMPLOYER_WALLET: '0xEMPLOYER',
  PAYROLL_EMPLOYEE: '0xWORKER',
  SINGLE_WALLET_DEMO: true,
}));

const { viewerRole, viewerRoles, can } = await import('./viewer-role');

/**
 * The single-wallet demo used to hand every role to whoever signed in, so one
 * account could play every part on stage. It also meant an employee was offered
 * the approval queue and the Approve button on their own overtime, and only the
 * server's 403 said no. Roles come from the wallet now, whatever the flag says.
 */
describe('the single-wallet demo flag no longer decides who anybody is', () => {
  /* Both of these were fixed on the flag's own path before it was removed. The
     answers have to survive the removal, because the account control is what
     asks and it has no stream in scope to pass an employee address from. */
  it('still labels the configured employee an employee', () => {
    expect(viewerRole('0xWORKER')).toBe('employee');
  });

  it('still labels the configured employer an employer', () => {
    expect(viewerRole('0xEMPLOYER')).toBe('employer');
  });

  /* This one changes on purpose. Calling an unknown wallet the treasurer is
     what dressed an employee as somebody who could approve and revoke. */
  it('calls an unknown wallet a member rather than the treasurer', () => {
    expect(viewerRole('0xwhicheverwalletsignedin')).toBe('member');
  });

  it('does not hand a stranger every role', () => {
    expect([...viewerRoles('0xwhicheverwalletsignedin')]).toEqual(['member']);
  });

  /* The guarantee the owner asked for, stated as a test. */
  it('never lets a wallet that is not the employer approve anything', () => {
    for (const address of ['0xwhicheverwalletsignedin', '0xTREASURER', '0xWORKER']) {
      expect(can(viewerRoles(address), 'approve'), address).toBe(false);
    }
    expect(can(viewerRoles('0xEMPLOYER'), 'approve')).toBe(true);
  });

  /* The treasurer role is gone: the employer holds the treasury now. */
  it('calls the old treasurer constant a member', () => {
    expect(viewerRole('0xTREASURER')).toBe('member');
  });

  it('still labels nobody when there is no address', () => {
    expect(viewerRole(null)).toBeNull();
  });
});
