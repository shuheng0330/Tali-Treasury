import { DEMO_TREASURER, EMPLOYER_WALLET, SINGLE_WALLET_DEMO } from './demo-config';

export type ViewerRole = 'treasurer' | 'employer' | 'employee' | 'member';

export const ROLE_LABEL: Record<ViewerRole, string> = {
  treasurer: 'Treasurer',
  employer: 'Employer',
  employee: 'Employee',
  member: 'Member',
};

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The server independently enforces who may actually act as treasurer or
 * employer on every write that matters, so this only ever hides convenience
 * UI, never a real boundary — a mismatched result gets a 403 from the
 * server, not a data leak. That's what makes it safe to answer 'treasurer'
 * unconditionally in single-wallet mode: the one demo wallet really is the
 * configured treasurer server-side, this just stops a stale local constant
 * (`DEMO_TREASURER`, recorded when the mandate was created) from hiding
 * treasurer-only controls from it after a mandate recreation moves that
 * address and nobody's updated the constant yet.
 */
export function viewerRole(
  address: string | null,
  /**
   * The treasurer recorded on the event being looked at. This is the authority
   * the server checks, so it wins wherever a screen has read an event.
   * `DEMO_TREASURER` is a build-time constant recorded when the original
   * mandate was created, and an event whose treasurer is anybody else would
   * otherwise have its real treasurer labelled a member.
   */
  eventTreasurer?: string | null,
): ViewerRole | null {
  if (!address) return null;
  if (SINGLE_WALLET_DEMO) return 'treasurer';
  const treasurer = eventTreasurer?.trim() || DEMO_TREASURER;
  if (sameAddress(address, treasurer)) return 'treasurer';
  if (sameAddress(address, EMPLOYER_WALLET)) return 'employer';
  return 'member';
}

/**
 * Every role the wallet holds, rather than the first one that matched.
 *
 * One wallet may be both employer and treasurer, and `viewerRole` has to keep
 * answering with one value because the session badge and the treasury dashboard
 * are built on it. Navigation needs the whole set: dropping a role there would
 * order the tabs as though the viewer could not do something they can.
 *
 * The employee address is passed in rather than read from the environment
 * because the authority is the `employee` field on the salary stream, which no
 * screen can read until a stream exists. Until then a caller supplies
 * `PAYROLL_EMPLOYEE`, which is the wallet the mandate will approve.
 */
export function viewerRoles(
  address: string | null,
  sources: { eventTreasurer?: string | null; employee?: string | null } = {},
): ReadonlySet<ViewerRole> {
  if (!address) return new Set();
  if (SINGLE_WALLET_DEMO) {
    return new Set<ViewerRole>(['treasurer', 'employer', 'employee', 'member']);
  }

  const roles = new Set<ViewerRole>();
  if (sameAddress(address, sources.eventTreasurer?.trim() || DEMO_TREASURER)) {
    roles.add('treasurer');
  }
  if (sameAddress(address, EMPLOYER_WALLET)) roles.add('employer');
  if (sameAddress(address, sources.employee)) roles.add('employee');

  /* Anyone signed in may open a claim; whether they are on the event roster is
     the server's answer to give, not ours. */
  roles.add('member');
  return roles;
}
