import type { Source } from '@/lib/api/client';

/**
 * Says which half of the screen is real. `docs/PROGRESS.md` forbids simulating
 * anything without a label, and a banner that says "this is a simulation" while
 * three of the calls are genuinely hitting the database is its own kind of
 * inaccuracy — so the wording follows what actually happened on this request.
 */
export function DataNotice({
  source,
  reason,
  live,
  simulated,
  plural = false,
}: {
  source: Source;
  reason: string | null;
  /** What the live path covers when it works. */
  live: string;
  /** What stays local either way. */
  simulated: string;
  /** Set when `live` names more than one thing. */
  plural?: boolean;
}) {
  const isLive = source === 'live';

  return (
    <p
      className={`rounded-card border p-4 text-caption ${
        isLive ? 'border-ok-line bg-ok-soft text-ok' : 'border-wait-line bg-wait-soft text-wait'
      }`}
    >
      {isLive ? (
        <>
          <span className="font-medium">
            {live} {plural ? 'are' : 'is'} live.
          </span>{' '}
          <span className="text-ink-2">{simulated}</span>
        </>
      ) : (
        <>
          <span className="font-medium">Sample data.</span>{' '}
          <span className="text-ink-2">
            {reason ? `${live} fell back because ${reason}. ` : ''}
            {simulated}
          </span>
        </>
      )}
    </p>
  );
}
