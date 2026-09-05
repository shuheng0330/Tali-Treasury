import type { ViewerRole } from './viewer-role';

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
  /** Whose section this primarily is. Every route stays reachable by URL. */
  role: ViewerRole;
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
    /* Membership is the one role everybody signed in holds, so this never gets
       greyed out and never earns a line in the note. That is the truth of it:
       an expense, an hour worked late and a day off are asked for by whoever
       did the work, whatever else they are. */
    role: 'member',
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
    full: 'Your earnings',
    subject: 'the earnings screen',
    role: 'employee',
    children: [],
  },
  {
    href: '/approvals',
    label: 'Approvals',
    full: 'Decide overtime and leave',
    subject: 'the approval queue',
    role: 'employer',
    children: [],
  },
  {
    href: '/payroll',
    label: 'Payroll',
    full: 'Run payroll',
    subject: 'the payroll run',
    role: 'employer',
    children: [
      { href: '/payroll', label: 'Run', blurb: 'Pay one salary and its three statutory shares in one transaction.' },
      { href: '/payroll/history', label: 'History', blurb: 'Every run this mandate has signed, and what each one paid.' },
      { href: '/payroll/setup', label: 'Set up', blurb: 'Fund a mandate whose contribution rules cannot be edited afterwards.' },
    ],
  },
  {
    href: '/treasury',
    label: 'Treasury',
    full: 'Treasurer view',
    subject: 'the treasury dashboard',
    role: 'treasurer',
    children: [
      { href: '/treasury', label: 'Claims', blurb: 'The event budget, the queue, and what has already been paid.' },
      { href: '/treasury/setup', label: 'Set up', blurb: 'Create an expense treasury and set the rules it will hold you to.' },
    ],
  },
  {
    href: '/safety',
    label: 'Safety',
    full: 'Safety tests',
    /* Open to anyone, and the part worth showing a stranger. Marking it the
       employer's greyed out the one section that needs no permission at all. */
    role: 'member',
    children: [
      { href: '/safety', label: 'Budget cap', blurb: 'Try to spend more than the mandate allows and watch the chain refuse.' },
      { href: '/safety/payroll', label: 'Payroll floor', blurb: 'Try to pay a salary that skips EPF and watch the contract refuse.' },
    ],
  },
];

const OWNER: Record<ViewerRole, string> = {
  employer: "the employer's",
  treasurer: "the treasurer's",
  employee: "the employee's",
  member: "a member's",
};

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
 * The viewer's own sections first, in declared order, then everything else in
 * declared order.
 *
 * Nothing is removed. A hidden tab reads as a broken app to somebody who came
 * looking for it, where a visible one that says whose it is explains itself.
 */
export function orderSections(
  roles: ReadonlySet<ViewerRole>,
  sections: readonly NavSection[] = NAV_SECTIONS,
): readonly NavSection[] {
  if (roles.size === 0) return sections;

  /* Everyone signed in is a member, so ranking that with the viewer's
     distinguishing role would push Requests above the screens they came for. */
  const rank = (section: NavSection) => {
    if (!roles.has(section.role)) return 2;
    return section.role === 'member' ? 1 : 0;
  };

  return [...sections].sort((a, b) => rank(a) - rank(b));
}

function list(items: readonly string[]): string {
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * One sentence naming the sections that are not this viewer's, and whose they
 * are.
 *
 * Said once under the nav rather than on each pill: the pills already fill two
 * rows on a phone, and the design rules do not let a title attribute be the
 * only place a fact lives.
 */
export function otherRolesNote(
  roles: ReadonlySet<ViewerRole>,
  sections: readonly NavSection[] = NAV_SECTIONS,
): string | null {
  if (roles.size === 0) return null;

  const sentences: string[] = [];
  for (const role of ['employer', 'treasurer', 'employee', 'member'] as const) {
    if (roles.has(role)) continue;
    const theirs = sections.filter((section) => section.role === role);
    if (theirs.length === 0) continue;
    /* Capitalised here rather than in the constant. A subject that carried its
       own capital read as a title in the middle of the list once a role owned
       two screens — "the earnings screen and The overtime claim form". */
    const named = list(theirs.map((section) => section.subject ?? section.full));
    sentences.push(
      `${named.charAt(0).toUpperCase()}${named.slice(1)} ${theirs.length > 1 ? 'are' : 'is'} ${OWNER[role]}.`,
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
