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

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <nav
        className="flex snap-x items-center gap-1 overflow-x-auto rounded-badge border border-rule bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              aria-label={tab.full}
              title={tab.full}
              className={`shrink-0 snap-start rounded-badge px-3 py-2 text-center font-display text-label uppercase transition-colors duration-150 sm:px-4 ${
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
