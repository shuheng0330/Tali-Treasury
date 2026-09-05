import { canAny, type Capability, type ViewerRole } from './viewer-role';

/** A screen inside a section, reached from the section's own sub-navigation. */
export interface NavChild {
  href: string;
  /** What the sub-tab reads. Three of these have to fit a 320px phone. */
  label: string;
  /** One line under the heading saying what this screen is for. */
  blurb: string;
}

export interface NavSection {
  href: string;
  /** What the pill reads. Short enough to survive six of them on a phone. */
  label: string;
  /** The whole section, for the tab's tooltip. */
  full: string;
  /**
   * How the note names this section. `full` addresses the reader, which in the
   * note would hand them somebody else's earnings. Singular, so the verb agrees,
   * and lower case: a role can own more than one screen, and the note
   * capitalises whichever subject opens its sentence.
   */
  subject?: string;
  /**
   * What a wallet must be able to do for this section to appear at all. Any one
   * of them is enough, because a section can be two people's screen without
   * being everybody's: Earnings is the employee's own pay and the employer's
   * view of the team, and holding neither keeps you out.
   */
  capabilities: readonly Capability[];
  /**
   * The screens inside it, first one being the section itself.
   *
   * Empty when the section is a single screen. A section never lists one child:
   * a sub-navigation with a single tab is a label pretending to be a control.
   */
  children: readonly NavChild[];
}

/**
 * Six sections, each a place rather than a step.
 *
 * The nav used to carry eight pills, four of which were steps inside another
 * one — Set up sat beside Payroll, Approve beside Overtime — so the strip mixed
 * two levels and read as a list of every screen in the app. Steps belong to
 * their section's sub-navigation, which leaves the top level answering only
 * "which part of the product is this".
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    href: '/requests',
    label: 'Requests',
    full: 'Expenses, overtime and leave',
    /* The people who do the work, which is everybody except the employer. An
       expense, an hour worked late and a day off are asked for by whoever did
       the work; the employer meets all three in the approval queue instead. */
    capabilities: ['request'],
    children: [
      {
        href: '/requests/expense',
        label: 'Expense',
        blurb: 'Photograph a receipt and get reimbursed from the event treasury.',
      },
      {
        href: '/requests/overtime',
        label: 'Overtime',
        blurb: 'Record hours past the normal day. Approved hours join the next payroll run.',
      },
      {
        href: '/requests/leave',
        label: 'Leave',
        blurb: 'Ask for time off. Only unpaid leave changes what payroll pays.',
      },
    ],
  },
  {
    href: '/earnings',
    label: 'Earnings',
    full: 'Pay as it accrues',
    subject: 'the earnings screen',
    /* Two wallets, one route. An employee opens their own salary and can
       withdraw from it; the employer opens the same screen and reads what
       everybody they pay has earned, with nothing to press. */
    capabilities: ['earn', 'overseeEarnings'],
    children: [],
  },
  {
    href: '/approvals',
    label: 'Approvals',
    full: 'Decide overtime and leave',
    subject: 'the approval queue',
    capabilities: ['approve'],
    children: [],
  },
  {
    href: '/payroll',
    label: 'Payroll',
    full: 'Run payroll',
    subject: 'the payroll run',
    capabilities: ['runPayroll'],
    children: [
      { href: '/payroll', label: 'Run', blurb: 'Pay one salary and its three statutory shares in one transaction.' },
      { href: '/payroll/history', label: 'History', blurb: 'Every run this mandate has signed, and what each one paid.' },
      { href: '/payroll/setup', label: 'Set up', blurb: 'Fund a mandate whose contribution rules cannot be edited afterwards.' },
    ],
  },
  {
    href: '/treasury',
    label: 'Treasury',
    full: 'The expense treasury',
    subject: 'the treasury dashboard',
    capabilities: ['holdTreasury'],
    children: [
      { href: '/treasury', label: 'Claims', blurb: 'The event budget, the queue, and what has already been paid.' },
      { href: '/treasury/setup', label: 'Set up', blurb: 'Create an expense treasury and set the rules it will hold you to.' },
    ],
  },
  {
    href: '/safety',
    label: 'Safety',
    full: 'Safety tests',
    /* Open to anyone, and the part worth showing a stranger. It needs no
       permission at all, so every role carries `proof`. */
    capabilities: ['proof'],
    children: [
      { href: '/safety', label: 'Budget cap', blurb: 'Try to spend more than the mandate allows and watch the chain refuse.' },
      { href: '/safety/payroll', label: 'Payroll floor', blurb: 'Try to pay a salary that skips EPF and watch the contract refuse.' },
    ],
  },
];

/**
 * The section a path belongs to, longest match winning.
 *
 * `/requests/overtime` has to mark Requests and `/payroll/setup` has to mark
 * Payroll, rather than leaving the nav blank on every screen that is not a
 * section index. Matching on whole segments is what stops `/payrollx` claiming
 * the `/payroll` tab.
 */
export function activeSection(
  pathname: string,
  sections: readonly NavSection[] = NAV_SECTIONS,
): NavSection | null {
  const path = pathname.replace(/\/+$/, '') || '/';

  let best: NavSection | null = null;
  for (const section of sections) {
    if (path !== section.href && !path.startsWith(`${section.href}/`)) continue;
    if (!best || section.href.length > best.href.length) best = section;
  }

  return best;
}

/**
 * The screen inside a section that a path is on.
 *
 * Longest match again, because a section's first child shares the section's own
 * href and would otherwise claim every path under it.
 */
export function activeChild(
  pathname: string,
  section: NavSection,
): NavChild | null {
  const path = pathname.replace(/\/+$/, '') || '/';

  let best: NavChild | null = null;
  for (const child of section.children) {
    if (path !== child.href && !path.startsWith(`${child.href}/`)) continue;
    if (!best || child.href.length > best.href.length) best = child;
  }

  return best;
}

/**
 * The sections this wallet may actually reach.
 *
 * Hidden, not dimmed. The nav used to carry every section and grey out the ones
 * that were somebody else's, on the reasoning that a missing tab reads as a
 * broken app. In practice it read as an app full of doors that open onto a
 * refusal: an employee was shown the approval queue and the approve button on
 * their own overtime, and only the server's 403 told them no. Showing people
 * what they can do is the kinder answer and the conventional one.
 *
 * Signed out is the exception and everything shows. Before a wallet is
 * connected there is no answer to give about who this is, and hiding on the
 * strength of not knowing would leave a first-time visitor an empty app; every
 * screen already says which wallet it wants.
 */
export function visibleSections(
  roles: ReadonlySet<ViewerRole>,
  sections: readonly NavSection[] = NAV_SECTIONS,
): readonly NavSection[] {
  if (roles.size === 0) return sections;
  return sections.filter((section) => canAny(roles, section.capabilities));
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
 * Every screen in the app group used to send Back to `/`, so leaving Set up
 * dropped the reader on the landing page rather than the payroll they were
 * configuring — three clicks from where they had been. A section that has no
 * screen of its own at its own href is the exception, and goes to the overview
 * rather than to a redirect that lands where the reader already is.
 *
 * Derived from `NAV_SECTIONS` rather than a second hand-written map, because a
 * map would be the thing that goes stale when a route moves.
 */
export function parentOf(
  pathname: string,
  sections: readonly NavSection[] = NAV_SECTIONS,
): NavParent {
  const path = pathname.replace(/\/+$/, '') || '/';
  const cut = path.lastIndexOf('/');
  if (cut <= 0) return OVERVIEW;

  const up = path.slice(0, cut);
  const section = sections.find((candidate) => candidate.href === up);

  return section && hasOwnScreen(section)
    ? { href: section.href, label: section.label, description: `Back to ${section.label}` }
    : OVERVIEW;
}

/**
 * Whether a section's own href is a screen rather than a signpost.
 *
 * Payroll, Treasury and Safety each lead their sub-navigation with the section
 * href itself, so going up lands on something. Requests does not: `/requests`
 * only redirects to the first of the three, which made Back on
 * `/requests/expense` a link to the page it was already on. Read off the
 * children rather than flagged by hand, because a flag is what goes stale when
 * a section later grows an index of its own.
 */
function hasOwnScreen(section: NavSection): boolean {
  return (
    section.children.length === 0 ||
    section.children.some((child) => child.href === section.href)
  );
}
