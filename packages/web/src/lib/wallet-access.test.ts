import { describe, expect, it } from 'vitest';
import { EMPLOYER_COPY, walletAccess } from './wallet-access';

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
});
