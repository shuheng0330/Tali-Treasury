import type { Claim } from '@tali/shared';
import { CLAIM_CHIP, ratioBps, toDisplay } from '@tali/shared';
import { Money } from '@/components/Money';
import { StatusChip } from '@/components/StatusChip';

interface Props {
  eventName: string;
  available: string;
  budget: string;
  claims: Claim[];
  onCapture: (file: File) => void;
}

function relative(atMs: number) {
  const minutes = Math.round((Date.now() - atMs) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function ClaimHome({ eventName, available, budget, claims, onCapture }: Props) {
  const used = 100 - ratioBps(available, budget) / 100;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-heading">{eventName}</h1>
        <div className="flex items-baseline justify-between gap-3">
          <Money amount={available} size="lead" />
          <span className="tnum text-caption text-ink-3">of {toDisplay(budget)} left</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-badge bg-sunken">
          <div className="h-full bg-accent" style={{ width: `${used}%` }} />
        </div>
      </section>

      <label className="flex h-16 cursor-pointer items-center justify-center gap-3 rounded-card bg-accent text-surface transition-colors duration-150 ease-pop hover:bg-accent/90 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
          <circle cx="12" cy="13" r="3.6" />
        </svg>
        <span className="text-subhead font-semibold">Snap a receipt</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onCapture(file);
            e.target.value = '';
          }}
        />
      </label>

      <section className="flex flex-col gap-3">
        <h2 className="text-label uppercase text-ink-3">My claims</h2>

        {claims.length === 0 ? (
          <p className="rounded-card border border-dashed border-rule px-4 py-8 text-center text-caption text-ink-3">
            Nothing yet. Photograph a receipt and it lands here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule rounded-card border border-rule bg-surface">
            {claims.map((claim) => (
              <li key={claim.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-body">{claim.merchant}</span>
                  <span className="flex items-center gap-2">
                    <StatusChip status={CLAIM_CHIP[claim.state]} />
                    <span className="text-caption text-ink-3" suppressHydrationWarning>
                      {relative(claim.updatedAtMs)}
                    </span>
                  </span>
                </div>
                <Money amount={claim.amount} size="row" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
