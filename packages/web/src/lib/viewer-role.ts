import { DEMO_TREASURER, EMPLOYER_WALLET, SINGLE_WALLET_DEMO } from './demo-config';

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
  const lower = address.toLowerCase();
  const treasurer = eventTreasurer?.trim() || DEMO_TREASURER;
  if (treasurer && lower === treasurer.toLowerCase()) return 'treasurer';
  if (EMPLOYER_WALLET && lower === EMPLOYER_WALLET.toLowerCase()) return 'employer';
  return 'member';
}
