import { describe, expect, it } from 'vitest';

import { NAV_SECTIONS, activeChild, activeSection, parentOf, visibleSections } from './nav';
import type { ViewerRole } from './viewer-role';

const roles = (...values: ViewerRole[]) => new Set<ViewerRole>(values);

describe('NAV_SECTIONS', () => {
  it('leads every section that has children with the section itself or its first screen', () => {
    for (const section of NAV_SECTIONS) {
      if (section.children.length === 0) continue;
      expect(activeSection(section.children[0]!.href), section.label).toBe(section);
    }
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

describe('visibleSections', () => {
  const labels = (set: ReadonlySet<ViewerRole>) =>
    visibleSections(set).map((section) => section.label);

  /* Before a wallet is connected there is no answer about who this is, and
     hiding on the strength of not knowing leaves a first-time visitor an app
     that looks broken. Every screen underneath says which wallet it wants. */
  it('shows everything to a visitor who has not connected a wallet', () => {
    expect(visibleSections(roles())).toEqual(NAV_SECTIONS);
  });

  /* The whole point: an employee is never shown the approval queue, so they
     never reach an Approve button the server would refuse. */
  it('never shows an employee the approvals', () => {
    expect(labels(roles('employee', 'member'))).toEqual(['Requests', 'Earnings', 'Safety']);
  });

  it('shows the employer every section', () => {
    expect(labels(roles('employer', 'member'))).toEqual([
      'Requests',
      'Earnings',
      'Approvals',
      'Payroll',
      'Treasury',
      'Safety',
    ]);
  });

  /**
   * The bug this replaced: a wallet holding no configured role saw Requests and
   * Safety and nothing else, so the one screen showing the salary this product
   * exists to pay was hidden from the person being paid.
   */
  it('shows a wallet with no configured role its own pay', () => {
    expect(labels(roles('member'))).toEqual(['Requests', 'Earnings', 'Safety']);
  });

  it('keeps every signed-in wallet able to ask, to earn, and to read the proofs', () => {
    for (const set of [
      roles('member'),
      roles('employee', 'member'),
      roles('employer', 'member'),
    ]) {
      expect(labels(set)).toContain('Requests');
      expect(labels(set)).toContain('Earnings');
      expect(labels(set)).toContain('Safety');
    }
  });

  it('never invents a section that is not declared', () => {
    for (const set of [roles(), roles('member'), roles('employer', 'member')]) {
      for (const section of visibleSections(set)) {
        expect(NAV_SECTIONS).toContain(section);
      }
    }
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
