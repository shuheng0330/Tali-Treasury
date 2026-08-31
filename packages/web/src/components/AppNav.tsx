'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/claim', label: 'Claim', full: 'Submit a claim' },
  { href: '/treasury', label: 'Treasury', full: 'Treasurer view' },
  { href: '/safety', label: 'Safety', full: 'Safety test' },
];

export function AppNav({ className = '' }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      className={`flex items-center gap-1 rounded-badge border border-rule bg-surface p-1 ${className}`}
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
            className={`flex-1 rounded-badge px-2.5 py-2 text-center font-display text-label uppercase transition-colors duration-150 sm:flex-none sm:px-4 ${
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
