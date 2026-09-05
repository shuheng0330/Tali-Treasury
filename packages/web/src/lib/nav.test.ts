import { describe, expect, it } from 'vitest';

import {
  NAV_SECTIONS,
  activeChild,
  activeSection,
  orderSections,
  otherRolesNote,
  parentOf,
} from './nav';
import type { ViewerRole } from './viewer-role';

const roles = (...values: ViewerRole[]) => new Set<ViewerRole>(values);

describe('NAV_SECTIONS', () => {
  it('leads every section that has children with the section itself or its first screen', () => {
    for (const section of NAV_SECTIONS) {
      if (section.children.length === 0) continue;
      expect(activeSection(section.children[0]!.href), section.label).toBe(section);
    }
  });

  /* AppNav lays the pills out two to a row below 380px and three above it,
     and both only fill whole rows at a count that divides by six. A seventh
     section would strand one pill alone on the last row at every width. */
  it('holds a count both phone layouts can fill whole rows with', () => {
    expect(NAV_SECTIONS.length % 6).toBe(0);
  });

  /* A single sub-tab is a label pretending to be a control. */
  it('never gives a section exactly one child', () => {
    for (const section of NAV_SECTIONS) {
      expect(section.children.length, section.label).not.toBe(1);
    }
  });

  it('keeps every child inside the section that declares it', () => {
    for (const section of NAV_SECTIONS) {
      for (const child of section.children) {
        expect(activeSection(child.href), child.href).toBe(section);
      }
    }
  });
});

describe('activeSection', () => {
  it('marks the section whose route this is', () => {
    expect(activeSection('/payroll')?.label).toBe('Payroll');
    expect(activeSection('/requests')?.label).toBe('Requests');
    expect(activeSection('/safety')?.label).toBe('Safety');
    expect(activeSection('/approvals')?.label).toBe('Approvals');
    expect(activeSection('/earnings')?.label).toBe('Earnings');
  });

  /* The whole point of the regroup: a step no longer marks a section of its
     own, so the strip stays on the place the reader is in. */
  it('marks the section on every screen inside it', () => {
    expect(activeSection('/payroll/setup')?.label).toBe('Payroll');
    expect(activeSection('/payroll/history')?.label).toBe('Payroll');
    expect(activeSection('/treasury/setup')?.label).toBe('Treasury');
    expect(activeSection('/requests/expense')?.label).toBe('Requests');
    expect(activeSection('/requests/overtime')?.label).toBe('Requests');
    expect(activeSection('/requests/leave')?.label).toBe('Requests');
    expect(activeSection('/safety/payroll')?.label).toBe('Safety');
  });

  it('ignores a trailing slash', () => {
    expect(activeSection('/payroll/')?.label).toBe('Payroll');
    expect(activeSection('/requests/leave/')?.label).toBe('Requests');
  });

  /* The bug a naive startsWith would reintroduce. */
  it('only matches whole segments', () => {
    expect(activeSection('/payrollx')).toBeNull();
    expect(activeSection('/requestsx')).toBeNull();
  });

  it('marks nothing on a route the nav does not carry', () => {
    expect(activeSection('/')).toBeNull();
    expect(activeSection('/system')).toBeNull();
    expect(activeSection('/start')).toBeNull();
  });

  it('never marks two sections for one route', () => {
    for (const path of [
      '/payroll',
      '/payroll/setup',
      '/treasury/setup',
      '/requests/expense',
      '/safety/payroll',
    ]) {
      const matches = NAV_SECTIONS.filter((section) => activeSection(path) === section);
      expect(matches, path).toHaveLength(1);
    }
  });
});

describe('activeChild', () => {
  const payroll = NAV_SECTIONS.find((section) => section.href === '/payroll')!;
  const requests = NAV_SECTIONS.find((section) => section.href === '/requests')!;
  const safety = NAV_SECTIONS.find((section) => section.href === '/safety')!;

  it('marks the screen inside the section', () => {
    expect(activeChild('/payroll', payroll)?.label).toBe('Run');
    expect(activeChild('/payroll/history', payroll)?.label).toBe('History');
    expect(activeChild('/requests/leave', requests)?.label).toBe('Leave');
    expect(activeChild('/safety/payroll', safety)?.label).toBe('Payroll floor');
  });

  /* Run's href is the section's own, so a shorter match must not win. */
  it('gives the longest match the sub-tab, so Set up is not also Run', () => {
    expect(activeChild('/payroll/setup', payroll)?.label).toBe('Set up');
    expect(activeChild('/safety', safety)?.label).toBe('Budget cap');
  });

  it('marks nothing where the section has no screen for the path', () => {
    expect(activeChild('/requests', requests)).toBeNull();
  });
});

describe('orderSections', () => {
  it('leaves the declared order alone when nobody is signed in', () => {
    expect(orderSections(roles())).toEqual(NAV_SECTIONS);
  });

  it('puts the employee’s section first', () => {
    expect(orderSections(roles('employee', 'member'))[0]!.label).toBe('Earnings');
  });

  it('puts the treasurer’s section first', () => {
    expect(orderSections(roles('treasurer', 'member'))[0]!.label).toBe('Treasury');
  });

  it('keeps every section, whatever the roles', () => {
    for (const set of [roles(), roles('member'), roles('employer', 'member')]) {
      const byHref = (a: { href: string }, b: { href: string }) => a.href.localeCompare(b.href);
      expect(orderSections(set)).toHaveLength(NAV_SECTIONS.length);
      expect([...orderSections(set)].sort(byHref)).toEqual([...NAV_SECTIONS].sort(byHref));
    }
  });

  it('keeps the viewer’s own sections ahead of the ones every wallet can open', () => {
    expect(orderSections(roles('employer', 'member')).map((section) => section.label)).toEqual([
      'Approvals',
      'Payroll',
      'Requests',
      'Safety',
      'Earnings',
      'Treasury',
    ]);
  });

  it('leads the employee with their own pay, then what anyone may ask for', () => {
    expect(
      orderSections(roles('employee', 'member'))
        .slice(0, 3)
        .map((section) => section.label),
    ).toEqual(['Earnings', 'Requests', 'Safety']);
  });
});

describe('otherRolesNote', () => {
  it('says nothing before anyone signs in', () => {
    expect(otherRolesNote(roles())).toBeNull();
  });

  it('names the employer’s sections to an employee', () => {
    expect(otherRolesNote(roles('employee', 'member'))).toBe(
      "The approval queue and the payroll run are the employer's. " +
        "The treasury dashboard is the treasurer's.",
    );
  });

  /* A subject that carried its own capital read as a title once a role owned
     two screens: "the approval queue and The payroll run". */
  it('capitalises only the subject that opens the sentence', () => {
    expect(otherRolesNote(roles('employee', 'treasurer', 'member'))).toBe(
      "The approval queue and the payroll run are the employer's.",
    );
  });

  it('agrees the verb with the count', () => {
    expect(otherRolesNote(roles('employer', 'employee', 'member'))).toBe(
      "The treasury dashboard is the treasurer's.",
    );
  });

  it('names a section in the third person, never handing the reader their own', () => {
    expect(otherRolesNote(roles('employer', 'member'))).toBe(
      "The treasury dashboard is the treasurer's. The earnings screen is the employee's.",
    );
  });

  /* Requests and Safety belong to the role every signed-in wallet holds, so
     they are never anybody else's and never earn a sentence. */
  it('never says a section is a member’s, because the reader always is one', () => {
    for (const set of [
      roles('member'),
      roles('employer', 'member'),
      roles('treasurer', 'member'),
      roles('employee', 'member'),
    ]) {
      expect(otherRolesNote(set) ?? '').not.toContain("a member's");
    }
  });

  it('says nothing when every section is the viewer’s', () => {
    expect(otherRolesNote(roles('employer', 'treasurer', 'employee', 'member'))).toBeNull();
  });
});

describe('parentOf', () => {
  it('sends a screen up to its own section, not the overview', () => {
    expect(parentOf('/treasury/setup')).toMatchObject({ href: '/treasury', label: 'Treasury' });
    expect(parentOf('/payroll/setup')).toMatchObject({ href: '/payroll', label: 'Payroll' });
    expect(parentOf('/payroll/history')).toMatchObject({ href: '/payroll', label: 'Payroll' });
    expect(parentOf('/safety/payroll')).toMatchObject({ href: '/safety', label: 'Safety' });
  });

  it('sends a section index to the overview', () => {
    for (const path of [
      '/payroll',
      '/treasury',
      '/requests',
      '/earnings',
      '/approvals',
      '/safety',
      '/start',
    ]) {
      expect(parentOf(path), path).toMatchObject({ href: '/', label: 'Overview' });
    }
  });

  it('handles the overview and a trailing slash', () => {
    expect(parentOf('/').href).toBe('/');
    expect(parentOf('/treasury/setup/').href).toBe('/treasury');
  });

  it('falls back to the overview when the parent segment is not a section', () => {
    expect(parentOf('/nowhere/deep').href).toBe('/');
  });

  /* `/requests` only redirects to the first of its three screens, so pointing
     Back at it made the button a link to the page the reader was already on. */
  it('sends a screen up to the overview when its section is only a signpost', () => {
    for (const path of ['/requests/expense', '/requests/overtime', '/requests/leave']) {
      expect(parentOf(path), path).toMatchObject({ href: '/', label: 'Overview' });
    }
  });

  it('names a destination the button can actually say', () => {
    expect(parentOf('/treasury/setup').description).toBe('Back to Treasury');
    expect(parentOf('/payroll').description).toBe('Back to the overview');
  });
});
