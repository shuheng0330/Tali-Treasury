import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_COPY,
  EMPLOYER_COPY,
  REVIEW_COPY,
  REVOKE_COPY,
  SETUP_COPY,
  eventTreasurerAccess,
  walletAccess,
} from './wallet-access';

const EMPLOYER = '0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471';
const SOMEBODY = '0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e';

describe('walletAccess', () => {
  it('refuses a signed-out reader and says which wallet to use', () => {
    const access = walletAccess(null, EMPLOYER, EMPLOYER_COPY);
    expect(access.permitted).toBe(false);
    expect(access.notice).toBe('Sign in with the employer wallet to run payroll.');
  });

  it('permits the configured wallet without comment', () => {
    expect(walletAccess(EMPLOYER, EMPLOYER, EMPLOYER_COPY)).toEqual({
      permitted: true,
      notice: null,
    });
  });

  it('ignores case and surrounding space in the configured value', () => {
    const access = walletAccess(EMPLOYER.toUpperCase(), `  ${EMPLOYER}  `, EMPLOYER_COPY);
    expect(access.permitted).toBe(true);
  });

  it('refuses another wallet and names both', () => {
    const access = walletAccess(SOMEBODY, EMPLOYER, EMPLOYER_COPY);
    expect(access.permitted).toBe(false);
    expect(access.notice).toContain('0x4052…b16e');
    expect(access.notice).toContain('0x9391…b471');
  });

  /* Every gate in the app used to be opened by a presentation flag, so that one
     account could play every part. An employee-only withdrawal offered to the
     employer was the clearest case of what that cost. */
  it('never lets one wallet stand in for another', () => {
    const access = walletAccess(SOMEBODY, EMPLOYER, EMPLOYEE_COPY);
    expect(access.permitted).toBe(false);
    expect(access.notice).toContain('Only 0x9391…b471');
  });

  /* The screen cannot know who the employer is before one is configured.
     Blocking everybody on a missing variable would be a guess dressed as a
     rule, and the server refuses an unauthorised run either way. */
  it('permits but explains itself when no wallet is configured', () => {
    const access = walletAccess(SOMEBODY, '', EMPLOYER_COPY);
    expect(access.permitted).toBe(true);
    expect(access.notice).toContain('not configured yet');
    expect(access.notice).toContain('The employer wallet');
  });

  it('still asks a signed-out reader to sign in when nothing is configured', () => {
    expect(walletAccess(null, '', EMPLOYER_COPY).permitted).toBe(false);
  });

  /* Creating the mandate and spending inside it are different acts, and the
     setup screen used to name neither — it let anyone fill the form and only
     refused on the first request. */
  it('names setting up payroll, not running it, on the setup screen', () => {
    expect(walletAccess(null, EMPLOYER, SETUP_COPY).notice).toBe(
      'Sign in with the employer wallet to set up payroll.',
    );
    expect(walletAccess(SOMEBODY, EMPLOYER, SETUP_COPY).notice).toContain('set up payroll');
  });

  /* Reviewing and revoking are the treasurer's and are named apart from each
     other: revoke pulls the agent's permission to spend, and calling that
     "review claims" would describe the wrong act on the more dangerous button. */
  it('names the treasurer acts separately', () => {
    expect(walletAccess(SOMEBODY, EMPLOYER, REVIEW_COPY).notice).toContain('review claims');
    expect(walletAccess(SOMEBODY, EMPLOYER, REVOKE_COPY).notice).toContain(
      'revoke this mandate',
    );
    expect(walletAccess(null, EMPLOYER, REVOKE_COPY).notice).toBe(
      "Sign in with the event treasurer's wallet to revoke this mandate.",
    );
  });

  it('keeps event-treasurer access strict', () => {
    expect(eventTreasurerAccess(EMPLOYER, EMPLOYER).permitted).toBe(true);
    expect(eventTreasurerAccess(SOMEBODY, EMPLOYER).permitted).toBe(false);
    expect(eventTreasurerAccess(EMPLOYER, null).permitted).toBe(false);
  });
});
