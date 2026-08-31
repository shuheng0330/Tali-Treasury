import { SPEND_CHECKS } from '@/lib/checks';

/**
 * Pure CSS, no state, no clock — so it server-renders identically and can never
 * mismatch on hydration. The list is emitted twice and the track slides by half
 * its width, which is what makes the loop seamless.
 *
 * Hidden from assistive tech on purpose: the same seven checks are further down
 * the page as a real ordered list, with their labels, which is the version worth
 * reading aloud.
 */
export function CheckMarquee() {
  const items = [...SPEND_CHECKS, ...SPEND_CHECKS];

  return (
    <div
      aria-hidden
      className="relative flex overflow-hidden border-y border-rule bg-canvas py-5"
    >
      <div className="flex w-max animate-drift items-center gap-10 pr-10 motion-reduce:animate-none">
        {items.map((check, i) => (
          <span key={`${check.code}-${i}`} className="flex shrink-0 items-center gap-3">
            <span className="tnum font-mono text-label text-accent-ink">
              {String(check.code).padStart(2, '0')}
            </span>
            <span className="text-label whitespace-nowrap text-ink-2">{check.key}</span>
            <span className="h-1 w-1 rounded-badge bg-rule-strong" />
          </span>
        ))}
      </div>

      <span className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-canvas to-transparent" />
      <span className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-canvas to-transparent" />
    </div>
  );
}
