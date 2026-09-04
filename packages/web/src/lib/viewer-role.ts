import { DEMO_EMPLOYER, DEMO_TREASURER, SINGLE_WALLET_DEMO } from './demo-config';

export type ViewerRole = 'treasurer' | 'employer' | 'member';

export const ROLE_LABEL: Record<ViewerRole, string> = {
  treasurer: 'Treasurer',
  employer: 'Employer',
  member: 'Member',
};

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
export function viewerRole(address: string | null): ViewerRole | null {
  if (!address) return null;
  if (SINGLE_WALLET_DEMO) return 'treasurer';
  const lower = address.toLowerCase();
  if (DEMO_TREASURER && lower === DEMO_TREASURER.toLowerCase()) return 'treasurer';
  if (DEMO_EMPLOYER && lower === DEMO_EMPLOYER.toLowerCase()) return 'employer';
  return 'member';
}
