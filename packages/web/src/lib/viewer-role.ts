import { DEMO_TREASURER, EMPLOYER_WALLET, PAYROLL_EMPLOYEE } from './demo-config';

export type ViewerRole = 'treasurer' | 'employer' | 'employee' | 'member';

export const ROLE_LABEL: Record<ViewerRole, string> = {
  treasurer: 'Treasurer',
  employer: 'Employer',
  employee: 'Employee',
  member: 'Member',
};

/**
 * What a wallet may do, named by the act rather than by the screen.
 *
 * Roles answer "who is this", capabilities answer "what may they reach", and
 * keeping them apart is what stops the answer being rewritten in every
 * component that needs it. A screen asks for a capability; only this table
 * decides which roles carry it.
 */
export type Capability =
  | 'request'
  | 'approve'
  | 'runPayroll'
  | 'holdTreasury'
  | 'earn'
  | 'proof';

/**
 * The employer holds the treasury as well as payroll: they are the one account
 * that administers this organisation, and a treasurer who is not the employer
 * still holds the event's expense budget on their own.
 *
 * The employer does NOT hold `earn`. It is not a screen about the business, it
 * is one person's salary stream, and putting it in an employer's navigation
 * would be exactly the clutter this model exists to remove.
 *
 * Everybody signed in may `request`, because an expense, an hour worked late
 * and a day off are asked for by whoever did the work, whatever else they are.
 */
const CAPABILITIES: Record<ViewerRole, readonly Capability[]> = {
  employer: ['request', 'approve', 'runPayroll', 'holdTreasury', 'proof'],
  treasurer: ['request', 'holdTreasury', 'proof'],
  employee: ['request', 'earn', 'proof'],
  member: ['request', 'proof'],
};

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Every capability the held roles add up to.
 *
 * A union, not a maximum: one wallet may be both employer and treasurer, and
 * taking the first role that matched would drop half of what it may do.
 */
export function capabilitiesOf(roles: ReadonlySet<ViewerRole>): ReadonlySet<Capability> {
  const held = new Set<Capability>();
  for (const role of roles) {
    for (const capability of CAPABILITIES[role]) held.add(capability);
  }
  return held;
}

export function can(roles: ReadonlySet<ViewerRole>, capability: Capability): boolean {
  return capabilitiesOf(roles).has(capability);
}

/**
 * The one role to call this wallet, for a badge that has room for one word.
 *
 * Ordered by how much of the product the role reaches, so a wallet that is both
 * employer and treasurer is labelled Employer rather than whichever the set
 * happened to yield first.
 */
const PRECEDENCE: readonly ViewerRole[] = ['employer', 'treasurer', 'employee', 'member'];

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
  const roles = viewerRoles(address, { eventTreasurer });
  return PRECEDENCE.find((role) => roles.has(role)) ?? null;
}

/**
 * Every role the wallet holds, rather than the first one that matched.
 *
 * The connected wallet is the whole of the answer. There used to be a
 * single-wallet demo mode here that handed every role to whoever signed in, so
 * that one account could play every part on stage; it also meant an employee
 * was offered the approval queue and the approve button on their own overtime,
 * which the server then refused with a 403 nobody had been warned about. The
 * flag still names the expense demo it was written for, and no longer decides
 * who anybody is.
 *
 * The employee address is passed in where a caller has read one, because the
 * authority is the `employee` field on the salary stream. No screen can read
 * that until a stream exists, and the account control has no stream in scope at
 * all, so `PAYROLL_EMPLOYEE` — the wallet the mandate will approve — stands in.
 * Without that fallback this could never answer 'employee' to a caller with
 * nothing to pass, which is how the badge came to call an employee a member.
 *
 * The server independently enforces every one of these on each write that
 * matters, so this only ever decides what is offered, never what is allowed.
 */
export function viewerRoles(
  address: string | null,
  sources: { eventTreasurer?: string | null; employee?: string | null } = {},
): ReadonlySet<ViewerRole> {
  if (!address) return new Set();

  const roles = new Set<ViewerRole>();
  if (sameAddress(address, sources.eventTreasurer?.trim() || DEMO_TREASURER)) {
    roles.add('treasurer');
  }
  if (sameAddress(address, EMPLOYER_WALLET)) roles.add('employer');
  /* Absent means the caller had nothing to pass and the configured wallet
     stands in; an explicit null means they read a stream and it named nobody,
     which is a real answer and must not be overridden. */
  const employee = sources.employee === undefined ? PAYROLL_EMPLOYEE : sources.employee;
  if (sameAddress(address, employee)) roles.add('employee');

  /* Anyone signed in may open a claim; whether they are on the event roster is
     the server's answer to give, not ours. */
  roles.add('member');
  return roles;
}
