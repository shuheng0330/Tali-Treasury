import type { Source } from '@/lib/api/demo';

/**
 * Says which half of the screen is real, in words somebody who has never heard
 * of a database would use. `docs/PROGRESS.md` forbids simulating anything
 * without a label, and a banner that says "this is a simulation" while three of
 * the calls are genuinely hitting the database is its own kind of inaccuracy —
 * so the wording follows what actually happened on this request.
 */
export function DataNotice({
  source,
  live,
  simulated,
  plural = false,
  brief,
  /**
   * What the fallback actually is, when it is not sample data. Records held in
   * memory are real; calling them a sample would be its own inaccuracy.
   */
  fallbackLabel = 'Preview data.',
  /**
   * What to say when the live path is down, where that is not the same thing
   * as what `simulated` says when it is up.
   *
   * The approval queue is why this exists. Its `simulated` line explains that
   * decisions are real but will be lost on a restart, which is true only of the
   * fallback — shown on the live path it told the employer their saved
   * approvals would vanish.
   */
  fallbackNote,
}: {
  source: Source;
  reason: string | null;
  /** What the live path covers when it works. */
  live: string;
  /** What stays local either way. */
  simulated: string;
  /** Set when `live` names more than one thing. */
  plural?: boolean;
  fallbackLabel?: string;
  fallbackNote?: string;
  /** A single concise status message for focused employee request forms. */
  brief?: { live: string; fallback: string };
}) {
  const isLive = source === 'live';

  return (
    <p
      className={`rounded-card border p-4 text-caption ${
        isLive ? 'border-ok-line bg-ok-soft text-ok' : 'border-wait-line bg-wait-soft text-wait'
      }`}
    >
      {brief ? (
        <span className="font-medium">{isLive ? brief.live : brief.fallback}</span>
      ) : isLive ? (
        <>
          <span className="font-medium">
            {live} {plural ? 'are' : 'is'} live.
          </span>{' '}
          <span className="text-ink-2">{simulated}</span>
        </>
      ) : (
        <>
          <span className="font-medium">{fallbackLabel}</span>{' '}
          <span className="text-ink-2">{fallbackNote ?? simulated}</span>
        </>
      )}
    </p>
  );
}
