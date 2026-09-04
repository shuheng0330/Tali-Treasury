'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/payroll/setup', label: 'Set up', full: 'Set up payroll' },
  { href: '/payroll', label: 'Payroll', full: 'Run payroll' },
  { href: '/earnings', label: 'Earn', full: 'Your earnings' },
  { href: '/treasury', label: 'Treasury', full: 'Treasurer view' },
  { href: '/claim', label: 'Claim', full: 'Submit a claim' },
  { href: '/safety', label: 'Safety', full: 'Safety test' },
];

export function AppNav({ className = '' }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      className={`flex snap-x items-center gap-1 overflow-x-auto rounded-badge border border-rule bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      aria-label="Sections"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            title={tab.full}
            className={`shrink-0 snap-start rounded-badge px-3 py-2 text-center font-display text-label uppercase transition-colors duration-150 sm:px-4 ${
              active
                ? 'bg-ink text-canvas'
                : 'text-ink-3 hover:bg-raised hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
