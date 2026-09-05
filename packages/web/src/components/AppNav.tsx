'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { PAYROLL_EMPLOYEE } from '@/lib/demo-config';
import { activeTab, orderTabs, otherRolesNote } from '@/lib/nav';
import { viewerRoles } from '@/lib/viewer-role';
import { useWalletSession } from './wallet/WalletSessionProvider';

export function AppNav({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const session = useWalletSession();

  /* No event is in scope up here, so the treasurer answer falls back to the
     build-time constant. A screen that has read an event decides for itself. */
  const roles = viewerRoles(session.address, { employee: PAYROLL_EMPLOYEE });
  const tabs = orderTabs(roles);
  const current = activeTab(pathname);
  const note = otherRolesNote(roles);
  /* Two rows, balanced, however many tabs there are — six gives three each. */
  const columns = Math.ceil(tabs.length / 2);

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      {/* A grid on a phone, not a wrapping row. As a single scrolling row the
          strip was 506px of tabs in a 341px box, leaving Claim and Safety off
          the right-hand edge with nothing on screen to say they existed. Left
          to wrap, it broke wherever the width happened to run out — four tabs
          then two on a 430px phone — which reads as an accident rather than a
          layout. Equal columns split them evenly whatever the width. */}
      <nav
        className="grid gap-1 rounded-badge border border-rule bg-surface p-1 sm:flex sm:flex-wrap sm:items-center"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        aria-label="Sections"
      >
        {tabs.map((tab) => {
          const active = current?.href === tab.href;
          const theirs = roles.size > 0 && !roles.has(tab.role);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              title={tab.full}
              className={`shrink-0 rounded-badge px-2.5 py-2 text-center font-display text-label uppercase transition-colors duration-150 ${
                active
                  ? 'bg-ink text-canvas'
                  : theirs
                    ? 'text-ink-3 hover:bg-raised hover:text-ink'
                    : 'text-ink hover:bg-raised'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {note ? <p className="text-caption text-ink-2 sm:max-w-sm">{note}</p> : null}
    </div>
  );
}
