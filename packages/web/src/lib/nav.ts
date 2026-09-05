import type { ViewerRole } from './viewer-role';

export interface NavTab {
  href: string;
  /** What the pill reads. Short enough to survive six of them on a phone. */
  label: string;
  /** The whole action, for the tab's tooltip. */
  full: string;
  /**
   * How the note names this screen. `full` addresses the reader, which in the
   * note would hand them somebody else's earnings. Singular, so the verb agrees.
   */
  subject?: string;
  /** Whose screen this primarily is. Every route stays reachable by URL. */
  role: ViewerRole;
}

export const NAV_TABS: readonly NavTab[] = [
  { href: '/payroll/setup', label: 'Set up', full: 'Set up payroll', role: 'employer' },
  { href: '/payroll', label: 'Payroll', full: 'Run payroll', role: 'employer' },
  { href: '/earnings', label: 'Earn', full: 'Your earnings', subject: 'The earnings screen', role: 'employee' },
  { href: '/treasury', label: 'Treasury', full: 'Treasurer view', role: 'treasurer' },
  { href: '/claim', label: 'Claim', full: 'Submit a claim', subject: 'The claim form', role: 'member' },
  { href: '/safety', label: 'Safety', full: 'Safety test', role: 'employer' },
];

const OWNER: Record<ViewerRole, string> = {
  employer: "the employer's",
  treasurer: "the treasurer's",
  employee: "the employee's",
  member: "a member's",
};

/**
 * The tab a path belongs to, longest match winning.
 *
 * `/payroll/setup` has to mark Set up rather than also marking Payroll, and
 * `/payroll/proof`, `/payroll/history` and `/treasury/setup` have to mark
 * something rather than leaving the nav blank. Matching on whole segments is
 * what stops `/payrollx` claiming the `/payroll` tab.
 */
export function activeTab(pathname: string, tabs: readonly NavTab[] = NAV_TABS): NavTab | null {
  const path = pathname.replace(/\/+$/, '') || '/';

  let best: NavTab | null = null;
  for (const tab of tabs) {
    if (path !== tab.href && !path.startsWith(`${tab.href}/`)) continue;
    if (!best || tab.href.length > best.href.length) best = tab;
  }

  return best;
}

/**
 * The viewer's own screens first, in declared order, then everything else in
 * declared order.
 *
 * Nothing is removed. A hidden tab reads as a broken app to somebody who came
 * looking for it, where a visible one that says whose it is explains itself.
 */
export function orderTabs(
  roles: ReadonlySet<ViewerRole>,
  tabs: readonly NavTab[] = NAV_TABS,
): readonly NavTab[] {
  if (roles.size === 0) return tabs;

  /* Everyone signed in is a member, so ranking that with the viewer's
     distinguishing role would push Claim above the screens they came for. */
  const rank = (tab: NavTab) => {
    if (!roles.has(tab.role)) return 2;
    return tab.role === 'member' ? 1 : 0;
  };

  return [...tabs].sort((a, b) => rank(a) - rank(b));
}

function list(items: readonly string[]): string {
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * One sentence naming the tabs that are not this viewer's, and whose they are.
 *
 * Said once under the nav rather than on each pill: six pills already scroll on
 * a phone, and the design rules do not let a title attribute be the only place
 * a fact lives.
 */
export function otherRolesNote(
  roles: ReadonlySet<ViewerRole>,
  tabs: readonly NavTab[] = NAV_TABS,
): string | null {
  if (roles.size === 0) return null;

  const sentences: string[] = [];
  for (const role of ['employer', 'treasurer', 'employee', 'member'] as const) {
    if (roles.has(role)) continue;
    const theirs = tabs.filter((tab) => tab.role === role);
    if (theirs.length === 0) continue;
    sentences.push(
      `${list(theirs.map((tab) => tab.subject ?? tab.full))} ${theirs.length > 1 ? 'are' : 'is'} ${OWNER[role]}.`,
    );
  }

  return sentences.length > 0 ? sentences.join(' ') : null;
}

export interface NavParent {
  href: string;
  /** What the button reads. Naming the destination beats a bare "Back". */
  label: string;
  description: string;
}

const OVERVIEW: NavParent = {
  href: '/',
  label: 'Overview',
  description: 'Back to the overview',
};

/**
 * One level up from a path, which is not the same as the overview.
 *
 * Every screen in the app group used to send Back to `/`, so leaving Create
 * expense treasury dropped the reader on the landing page rather than the
 * treasury they were setting up — three clicks from where they had been. The
 * sub-routes are the ones that suffer: `/treasury/setup`, `/payroll/setup`,
 * `/payroll/proof` and `/payroll/history` all sit under a section that is
 * itself a destination.
 *
 * Derived from `NAV_TABS` rather than a second hand-written map, because a map
 * would be the thing that goes stale when a route moves.
 */
export function parentOf(pathname: string, tabs: readonly NavTab[] = NAV_TABS): NavParent {
  const path = pathname.replace(/\/+$/, '') || '/';
  const cut = path.lastIndexOf('/');
  if (cut <= 0) return OVERVIEW;

  const up = path.slice(0, cut);
  const tab = tabs.find((candidate) => candidate.href === up);

  return tab
    ? { href: tab.href, label: tab.label, description: `Back to ${tab.label}` }
    : OVERVIEW;
}
