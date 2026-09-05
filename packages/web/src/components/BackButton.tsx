'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { parentOf } from '@/lib/nav';

/**
 * Deliberately a plain link one level up rather than history.back().
 *
 * Browser-back needs to know whether anything of ours is behind the current
 * page, and every way of knowing that is unreliable here: document.referrer is
 * empty for a phone that opened this straight off the QR code, and a counter of
 * in-app navigations gets double-counted by Strict Mode in development. Both
 * failure modes end the same way — back throws the visitor off the site.
 *
 * Where "up" goes is `parentOf`, so a sub-route returns to its own section
 * instead of the overview. The button names the destination, because on a
 * screen reached from a tab strip "Back" alone does not say which of two
 * plausible places it means.
 */
export function BackButton({
  href,
  label,
  description,
}: {
  href?: string;
  label?: string;
  description?: string;
}) {
  const pathname = usePathname();
  const parent = parentOf(pathname ?? '/');

  return (
    <Link
      href={href ?? parent.href}
      aria-label={description ?? parent.description}
      title={description ?? parent.description}
      className="btn btn--ghost group h-9 w-9 shrink-0 gap-2 px-0 text-label sm:w-auto sm:px-4"
    >
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0 transition-transform duration-200 ease-pop group-hover:-translate-x-0.5"
      >
        <path d="M10 3 5 8l5 5" />
      </svg>
      {/* Icon-only on a phone. The row has to hold the wordmark and the wallet
          control beside it, and at 375px the destination name was the 60px
          that pushed the wallet onto a line of its own — the thing this header
          was trying to stop. The name is still on the button, in aria-label
          and title, and returns as text from sm up. */}
      <span className="hidden sm:inline">{label ?? parent.label}</span>
    </Link>
  );
}
