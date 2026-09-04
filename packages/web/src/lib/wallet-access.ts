import { SINGLE_WALLET_DEMO } from './demo-config';

export interface Access {
  /**
   * False only when the wallet that may act is known and this is not it, or
   * when nobody is signed in at all.
   */
  permitted: boolean;
  /** What to tell the reader, or null when there is nothing worth saying. */
  notice: string | null;
}

export interface AccessCopy {
  /** Verb phrase: "run payroll", "withdraw from this stream". */
  action: string;
  /** Noun phrase for the wallet allowed to do it: "the employer wallet". */
  holder: string;
}

function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/**
 * Whether the signed-in wallet is the one allowed to act, and what to say when
 * it is not.
 *
 * The server independently refuses an unauthorised write, so this decides
 * nothing — it exists so a button is not offered to someone it will refuse. An
 * unexplained 403 after a click is worse than a disabled control that says who
 * the action belongs to.
 *
 * An unconfigured `expected` deliberately permits rather than blocks. The
 * screen cannot tell who the employer is before one is configured, and
 * refusing everybody on the strength of a missing environment variable would
 * be a guess dressed as a rule.
 */
export function walletAccess(
  address: string | null,
  expected: string,
  copy: AccessCopy,
): Access {
  if (!address) {
    return { permitted: false, notice: `Sign in with ${copy.holder} to ${copy.action}.` };
  }
  if (SINGLE_WALLET_DEMO) return { permitted: true, notice: null };

  const configured = expected.trim();
  if (!configured) {
    return {
      permitted: true,
      notice: `${copy.holder.charAt(0).toUpperCase()}${copy.holder.slice(1)} is not configured yet, so this screen cannot check who may ${copy.action}. The server still refuses an unauthorised attempt.`,
    };
  }

  if (address.toLowerCase() === configured.toLowerCase()) {
    return { permitted: true, notice: null };
  }

  return {
    permitted: false,
    notice: `You are signed in as ${short(address)}. Only ${short(configured)} can ${copy.action}.`,
  };
}

export const EMPLOYER_COPY: AccessCopy = {
  action: 'run payroll',
  holder: 'the employer wallet',
};

/**
 * Separate from `EMPLOYER_COPY` because they are separate acts. Creating the
 * mandate fixes the rules; running payroll spends inside them. Telling a
 * visitor on the setup screen that they cannot "run payroll" would name the
 * wrong thing.
 */
export const SETUP_COPY: AccessCopy = {
  action: 'set up payroll',
  holder: 'the employer wallet',
};

/**
 * Reviewing and revoking are both the treasurer's, and both are named
 * separately for the same reason setup is named apart from running payroll: a
 * notice that says you cannot "review claims" on the button that pulls the
 * agent's permission would describe the wrong act.
 *
 * The holder is the treasurer recorded on the *event*, not a global one. That
 * is the authority the server checks, and it differs per event.
 */
export const REVIEW_COPY: AccessCopy = {
  action: 'review claims',
  holder: "the event treasurer's wallet",
};

export const REVOKE_COPY: AccessCopy = {
  action: 'revoke this mandate',
  holder: "the event treasurer's wallet",
};

export const EMPLOYEE_COPY: AccessCopy = {
  action: 'withdraw from this stream',
  holder: "the employee's wallet",
};

export const ATTACK_COPY: AccessCopy = {
  action: 'send a real attempt',
  holder: 'the employer wallet',
};
