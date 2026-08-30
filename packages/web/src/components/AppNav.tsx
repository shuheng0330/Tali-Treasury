'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/claim', label: 'Claim', full: 'Submit a claim' },
  { href: '/treasury', label: 'Treasury', full: 'Treasurer view' },
  { href: '/safety', label: 'Safety', full: 'Safety test' },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1" aria-label="Sections">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            title={tab.full}
            className={`rounded-control px-2 py-1 text-caption transition-colors duration-150 sm:px-4 sm:py-2 ${
              active
                ? 'bg-raised font-medium text-ink'
                : 'text-ink-3 hover:bg-raised hover:text-ink-2'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
