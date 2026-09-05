'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { PAYROLL_EMPLOYEE } from '@/lib/demo-config';
import { activeSection, orderSections, otherRolesNote } from '@/lib/nav';
import { viewerRoles } from '@/lib/viewer-role';
import { useWalletSession } from './wallet/WalletSessionProvider';

export function AppNav({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const session = useWalletSession();

  /* No event is in scope up here, so the treasurer answer falls back to the
     build-time constant. A screen that has read an event decides for itself. */
  const roles = viewerRoles(session.address, { employee: PAYROLL_EMPLOYEE });
  const sections = orderSections(roles);
  const current = activeSection(pathname);
  const note = otherRolesNote(roles);

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      {/* A grid on a phone, not a wrapping row. As a single scrolling row the
          strip ran wider than the box and left the last sections off the
          right-hand edge with nothing on screen to say they existed. Left to
          wrap, it broke wherever the width happened to run out, which reads as
          an accident rather than a layout. Equal columns split them evenly
          whatever the width.

          Two columns below 360px and three from there, which is where
          APPROVALS — nine tracked uppercase characters, the longest label —
          starts fitting a third of the row. 360px is the width the rest of the
          design already turns on. Both counts give six sections whole rows;
          `NAV_SECTIONS` is tested for that count so a seventh cannot quietly
          leave one pill stranded alone on the last row. */}
      <nav
        className="grid grid-cols-2 gap-1 rounded-badge border border-rule bg-surface p-1 min-[360px]:grid-cols-3 sm:flex sm:flex-wrap sm:items-center"
        aria-label="Sections"
      >
        {sections.map((section) => {
          const active = current?.href === section.href;
          const theirs = roles.size > 0 && !roles.has(section.role);

          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              title={section.full}
              className={`flex min-h-11 shrink-0 items-center justify-center rounded-badge px-2.5 text-center font-display text-label uppercase transition-colors duration-150 sm:min-h-0 sm:py-2 ${
                active
                  ? 'bg-ink text-canvas'
                  : theirs
                    ? 'text-ink-2 hover:bg-raised hover:text-ink'
                    : 'text-ink hover:bg-raised'
              }`}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>

      {note ? <p className="text-caption text-ink-2 sm:max-w-sm">{note}</p> : null}
    </div>
  );
}
