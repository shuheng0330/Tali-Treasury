import { describe, expect, it } from 'vitest';

import { NAV_TABS, activeTab, orderTabs, otherRolesNote } from './nav';
import type { ViewerRole } from './viewer-role';

const roles = (...values: ViewerRole[]) => new Set<ViewerRole>(values);

describe('activeTab', () => {
  it('marks the tab whose route this is', () => {
    expect(activeTab('/payroll')?.label).toBe('Payroll');
    expect(activeTab('/claim')?.label).toBe('Claim');
    expect(activeTab('/safety')?.label).toBe('Safety');
  });

  it('marks the parent tab on a sub-route', () => {
    expect(activeTab('/payroll/proof')?.label).toBe('Payroll');
    expect(activeTab('/payroll/history')?.label).toBe('Payroll');
    expect(activeTab('/treasury/setup')?.label).toBe('Treasury');
  });

  it('gives the longest match the tab, so setup is not also payroll', () => {
    expect(activeTab('/payroll/setup')?.label).toBe('Set up');
  });

  it('ignores a trailing slash', () => {
    expect(activeTab('/payroll/')?.label).toBe('Payroll');
    expect(activeTab('/payroll/proof/')?.label).toBe('Payroll');
  });

  /* The bug a naive startsWith would reintroduce. */
  it('only matches whole segments', () => {
    expect(activeTab('/payrollx')).toBeNull();
    expect(activeTab('/claims')).toBeNull();
  });

  it('marks nothing on a route the nav does not carry', () => {
    expect(activeTab('/')).toBeNull();
    expect(activeTab('/system')).toBeNull();
  });

  it('never marks two tabs for one route', () => {
    for (const path of ['/payroll', '/payroll/setup', '/payroll/proof', '/treasury/setup']) {
      const matches = NAV_TABS.filter((tab) => activeTab(path) === tab);
      expect(matches, path).toHaveLength(1);
    }
  });
});

describe('orderTabs', () => {
  it('leaves the declared order alone when nobody is signed in', () => {
    expect(orderTabs(roles())).toEqual(NAV_TABS);
  });

  it('puts the employee’s screen first', () => {
    expect(orderTabs(roles('employee', 'member'))[0]!.label).toBe('Earn');
  });

  it('puts the treasurer’s screens first', () => {
    const ordered = orderTabs(roles('treasurer', 'member'));
    expect(ordered.slice(0, 2).map((tab) => tab.label)).toEqual(['Treasury', 'Claim']);
  });

  it('keeps every tab, whatever the roles', () => {
    for (const set of [roles(), roles('member'), roles('employer', 'member')]) {
      const byHref = (a: { href: string }, b: { href: string }) => a.href.localeCompare(b.href);
      expect(orderTabs(set)).toHaveLength(NAV_TABS.length);
      expect([...orderTabs(set)].sort(byHref)).toEqual([...NAV_TABS].sort(byHref));
    }
  });

  it('keeps the viewer’s own screens ahead of the claim every wallet can open', () => {
    const ordered = orderTabs(roles('employer', 'member'));
    expect(ordered.map((tab) => tab.label)).toEqual([
      'Set up',
      'Payroll',
      'Safety',
      'Claim',
      'Earn',
      'Treasury',
    ]);
  });
});

describe('otherRolesNote', () => {
  it('says nothing before anyone signs in', () => {
    expect(otherRolesNote(roles())).toBeNull();
  });

  it('names the employer’s screens to an employee', () => {
    const note = otherRolesNote(roles('employee', 'member'));
    expect(note).toContain("Set up payroll, Run payroll and Safety test are the employer's.");
    expect(note).toContain("Treasurer view is the treasurer's.");
  });

  it('agrees the verb with the count', () => {
    const note = otherRolesNote(roles('employer', 'employee', 'member'));
    expect(note).toBe("Treasurer view is the treasurer's.");
  });

  it('names a screen in the third person, never handing the reader their own', () => {
    expect(otherRolesNote(roles('employer', 'member'))).toBe(
      "Treasurer view is the treasurer's. The earnings screen is the employee's.",
    );
    expect(otherRolesNote(roles('treasurer', 'member'))).toBe(
      "Set up payroll, Run payroll and Safety test are the employer's. The earnings screen is the employee's.",
    );
  });

  it('says nothing when every tab is the viewer’s', () => {
    expect(otherRolesNote(roles('employer', 'treasurer', 'employee', 'member'))).toBeNull();
  });
});
