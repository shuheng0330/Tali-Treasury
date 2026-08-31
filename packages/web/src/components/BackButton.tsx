import Link from 'next/link';

/**
 * Deliberately a plain link to the overview rather than history.back().
 *
 * Browser-back needs to know whether anything of ours is behind the current
 * page, and every way of knowing that is unreliable here: document.referrer is
 * empty for a phone that opened this straight off the QR code, and a counter of
 * in-app navigations gets double-counted by Strict Mode in development. Both
 * failure modes end the same way — back throws the visitor off the site.
 *
 * Every screen in this group sits directly under the overview, so "up" and
 * "back" are the same destination anyway.
 */
export function BackButton({
  href = '/',
  label = 'Back',
  description = 'Back to the overview',
}: {
  href?: string;
  label?: string;
  description?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={description}
      title={description}
      className="btn btn--ghost group h-9 shrink-0 gap-2 px-4 text-label"
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
        className="transition-transform duration-200 ease-pop group-hover:-translate-x-0.5"
      >
        <path d="M10 3 5 8l5 5" />
      </svg>
      {label}
    </Link>
  );
}
