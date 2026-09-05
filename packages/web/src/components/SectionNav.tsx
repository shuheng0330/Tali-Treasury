'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { activeChild, activeSection } from '@/lib/nav';

/**
 * The screens inside the current section.
 *
 * A second strip rather than more pills in the first one. Six top-level pills
 * already fill two rows on a phone, and the steps inside a section are not
 * peers of the section — putting Set up beside Payroll said they were, which is
 * what made the app read as a list of every screen it has.
 *
 * It lives in the chrome under the header rather than inside each page, so it
 * lands in the same place at the same width on every screen that has one. The
 * pages below it are between 448px and 896px wide depending on what they hold,
 * and a strip that moved with them would read as page content rather than as
 * navigation.
 *
 * Renders nothing at all — band, rule and padding included — where a section
 * has no children, so a single screen keeps its full height.
 */
export function SectionNav() {
  const pathname = usePathname();
  const section = activeSection(pathname);
  if (!section || section.children.length === 0) return null;

  const current = activeChild(pathname, section);

  return (
    <div className="border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-5xl px-4 py-2 sm:px-6">
        <nav
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto sm:flex-none"
          aria-label={`${section.label} screens`}
        >
          {section.children.map((child) => {
            const active = current?.href === child.href;

            return (
              <Link
                key={child.href}
                href={child.href}
                aria-current={active ? 'page' : undefined}
                title={child.blurb}
                className={`flex min-h-11 flex-1 shrink-0 items-center justify-center whitespace-nowrap rounded-badge px-3 text-center font-display text-label uppercase transition-colors duration-150 sm:min-h-0 sm:flex-none sm:px-4 sm:py-2 ${
                  active ? 'bg-ink text-canvas' : 'text-ink-2 hover:bg-raised hover:text-ink'
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
