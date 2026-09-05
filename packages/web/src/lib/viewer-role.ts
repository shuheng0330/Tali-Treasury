import { EMPLOYER_WALLET, PAYROLL_EMPLOYEE } from './demo-config';

/**
 * Three answers, because there are three kinds of wallet.
 *
 * There was a fourth, `treasurer`, holding the event's expense budget while the
 * employer held payroll. They are one person here: the same account creates the
 * treasury, funds payroll, and decides what either of them pays. Splitting them
 * described an organisation this product does not have, and left the employer
 * looking at a Treasury tab that was somebody else's.
 */
export type ViewerRole = 'employer' | 'employee' | 'member';

export const ROLE_LABEL: Record<ViewerRole, string> = {
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
  | 'overseeEarnings'
  | 'proof';

/**
 * Gate authority over other people, and keep what is yours apart from theirs.
 *
 * Approving a claim, running payroll and holding the treasury are powers over
 * others. Asking for something, reading your own pay and watching the contract
 * refuse are not powers at all: they are a person's own business, and every
 * wallet that is paid here carries them.
 *
 * The employer is the one wallet that carries neither request nor earn, and
 * that is a statement about the job rather than a restriction. They do not file
 * a claim with themselves — the approval queue is the same three kinds of
 * request seen from the deciding side — and they draw no salary from a mandate
 * they fund, so the earnings screen would open on nothing. What they hold
 * instead is `overseeEarnings`: the same screen showing what everybody they pay
 * has earned so far, and no withdraw button anywhere on it. Only the wallet a
 * stream names can take money out of it, and the contract is what says so.
 *
 * `earn` was briefly the employee's alone, which was a plain mistake. The
 * screen behind it resolves the connected wallet's own payrolls — the server
 * reads them with `listByEmployee` and refuses any mandate the wallet is not
 * party to — and it says so plainly when there are none. Gating it on a
 * build-time constant naming one wallet meant that everybody else, in a product
 * whose entire idea is that a salary accrues by the second and you withdraw
 * what you have already earned, could not see their salary.
 *
 * Whether a wallet has a stream is a question about data, and the screen
 * answers it honestly. It was never a question about permission.
 */
const CAPABILITIES: Record<ViewerRole, readonly Capability[]> = {
  employer: ['approve', 'runPayroll', 'holdTreasury', 'overseeEarnings', 'proof'],
  employee: ['request', 'earn', 'proof'],
  member: ['request', 'earn', 'proof'],
};

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Every capability the held roles add up to.
 *
 * A union, not a maximum: the wallet a salary stream names is also a member of
 * the event, and taking the first role that matched would drop half of what it
 * may do.
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
 * Whether any one of several capabilities is held.
 *
 * One screen can belong to two kinds of wallet without belonging to everybody.
 * The earnings screen is the case that needed this: an employee holds `earn`
 * and sees their own pay, the employer holds `overseeEarnings` and sees the
 * team's, and nobody holding neither gets in.
 */
export function canAny(
  roles: ReadonlySet<ViewerRole>,
  capabilities: readonly Capability[],
): boolean {
  const held = capabilitiesOf(roles);
  return capabilities.some((capability) => held.has(capability));
}

/**
 * The one role to call this wallet, for a badge that has room for one word.
 *
 * Ordered by how much of the product the role reaches, so a wallet that is both
 * employer and treasurer is labelled Employer rather than whichever the set
 * happened to yield first.
 */
const PRECEDENCE: readonly ViewerRole[] = ['employer', 'employee', 'member'];

export function viewerRole(address: string | null): ViewerRole | null {
  const roles = viewerRoles(address);
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
 * The employer is the configured wallet and nothing else. It is deliberately
 * not also granted to whoever an event happens to record as its treasurer: the
 * server checks each action against its own authority — `TALI_EMPLOYER_WALLET`
 * for payroll, the event's own `treasurer_wallet` for claims — and handing the
 * role to two wallets would put the Treasury tab in front of one of them and a
 * 403 behind it. Where those two differ, the treasury screen still says so on
 * the controls themselves rather than pretending.
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
  sources: { employee?: string | null } = {},
): ReadonlySet<ViewerRole> {
  if (!address) return new Set();

  /* The employer holds this role and no other. Membership is what carries
     `request`, so a union that added it back would put the three claim forms in
     front of the one person whose job is to decide them — the employer would
     approve their own overtime, and the approval queue would be filling itself.
     Where the same wallet is also named on a stream, employer still wins: the
     precedence below already says which of the two this account is, and a
     withdrawal is refused by the contract to anyone but the employee the stream
     names, whatever this file thinks. */
  if (sameAddress(address, EMPLOYER_WALLET)) return new Set<ViewerRole>(['employer']);

  const roles = new Set<ViewerRole>();
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
