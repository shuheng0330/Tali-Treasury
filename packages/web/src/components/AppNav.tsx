'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { PAYROLL_EMPLOYEE } from '@/lib/demo-config';
import { activeSection, visibleSections } from '@/lib/nav';
import { viewerRoles } from '@/lib/viewer-role';
import { useWalletSession } from './wallet/WalletSessionProvider';

export function AppNav({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const session = useWalletSession();

  /* No event is in scope up here, so the treasurer answer falls back to the
     build-time constant. A screen that has read an event decides for itself. */
  const roles = viewerRoles(session.address, { employee: PAYROLL_EMPLOYEE });
  const sections = visibleSections(roles);
  const current = activeSection(pathname);
  /* Two rows on a phone whatever the count: three sections give two and one,
     five give three and two. Ceil so the first row is never the short one. */
  const columns = Math.ceil(sections.length / 2);

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      {/* A grid on a phone, not a wrapping row. As a single scrolling row the
          strip ran wider than the box and left the last sections off the
          right-hand edge with nothing on screen to say they existed. Left to
          wrap, it broke wherever the width happened to run out, which reads as
          an accident rather than a layout.

          The column count follows what this wallet can actually reach, because
          that is no longer always six: an employee sees three, an employer
          five, a visitor who has not connected one sees all six. Splitting the
          row evenly beats a fixed breakpoint once the count can change. */}
      <nav
        className="grid gap-1 rounded-badge border border-rule bg-surface p-1 sm:flex sm:flex-wrap sm:items-center"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        aria-label="Sections"
      >
        {sections.map((section) => {
          const active = current?.href === section.href;

          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              title={section.full}
              className={`flex min-h-11 shrink-0 items-center justify-center rounded-badge px-2.5 text-center font-display text-label uppercase transition-colors duration-150 sm:min-h-0 sm:py-2 ${
                active ? 'bg-ink text-canvas' : 'text-ink hover:bg-raised'
              }`}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
