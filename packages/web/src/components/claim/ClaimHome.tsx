import type { Claim } from '@tali/shared';
import { CLAIM_CHIP, EXPLORER, ratioBps, toDisplay } from '@tali/shared';
import { Money } from '@/components/Money';
import { StatusChip } from '@/components/StatusChip';

interface Props {
  eventName: string;
  available: string;
  budget: string;
  claims: Claim[];
  claimsLoading?: boolean;
  onCorrect: (claim: Claim) => void;
  captureDisabled?: boolean;
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

export function ClaimHome({
  eventName,
  available,
  budget,
  claims,
  claimsLoading = false,
  onCorrect,
  captureDisabled = false,
  onCapture,
}: Props) {
  const used = budget === '0' ? 0 : 100 - ratioBps(available, budget) / 100;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-heading">{eventName}</h1>
        <div className="flex items-baseline justify-between gap-3">
          <Money amount={available} size="lead" />
          <span className="tnum text-caption text-ink-3">of {toDisplay(budget)} left</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-badge bg-sunken">
          <div className="h-full bg-ink" style={{ width: `${used}%` }} />
        </div>
      </section>
      <label
        className={`btn btn--block h-16 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-ink ${
          captureDisabled
            ? 'cursor-not-allowed border-rule bg-raised text-ink-3'
            : 'btn--primary cursor-pointer'
        }`}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
          <circle cx="12" cy="13" r="3.6" />
        </svg>
        <span>Snap a receipt</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={captureDisabled}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onCapture(file);
            e.target.value = '';
          }}
        />
      </label>

      <section className="flex flex-col gap-3">
        {claims
          .filter((claim) => claim.state === 'needs_correction')
          .map((claim) => (
            <div
              key={claim.id}
              className="mb-5 flex flex-col gap-3 rounded-card border border-wait-line bg-wait-soft p-4"
            >
              <div className="flex flex-col gap-1">
                <span className="text-body font-medium text-wait">
                  {claim.merchant} needs a correction
                </span>
                <p className="text-caption text-ink-2">
                  {claim.review?.reason ??
                    'The treasurer sent this back. Check the details against the receipt.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onCorrect(claim)}
                className="btn btn--primary h-9 w-fit px-5 text-label"
              >
                Fix and resubmit
              </button>
            </div>
          ))}

        <h2 className="eyebrow">My claims</h2>

        {claimsLoading ? (
          <p className="rounded-card border border-dashed border-rule px-4 py-8 text-center text-caption text-ink-3">
            Loading submitted claims…
          </p>
        ) : claims.length === 0 ? (
          <p className="rounded-card border border-dashed border-rule px-4 py-8 text-center text-caption text-ink-3">
            Nothing yet. Photograph a receipt and it lands here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-card border border-rule bg-surface">
            {claims.map((claim) => (
              <li key={claim.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-body">{claim.merchant}</span>
                    <span className="flex items-center gap-2">
                      <StatusChip status={CLAIM_CHIP[claim.state]} />
                      <span className="text-caption text-ink-3" suppressHydrationWarning>
                        {relative(claim.updatedAtMs)}
                      </span>
                    </span>
                  </div>
                  <Money
                    amount={claim.amount}
                    unit={claim.analysis?.currency ?? 'USDC'}
                    size="row"
                  />
                </div>

                {claim.state === 'paid' && claim.payment?.digest ? (
                  <a
                    className="link self-start text-caption"
                    href={EXPLORER.tx(claim.payment.digest).suiscan}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View the transaction that paid you
                  </a>
                ) : null}

                {claim.state === 'payment_failed' && claim.payment ? (
                  <p className="text-caption text-no">
                    Nothing was paid. {claim.payment.message}
                  </p>
                ) : null}

                {claim.state === 'rejected' && claim.review?.reason ? (
                  <p className="text-caption text-ink-2">
                    Rejected: {claim.review.reason}
                  </p>
                ) : null}

                {claim.state === 'paying' ? (
                  <p className="text-caption text-wait">
                    The payment has been sent and is waiting to confirm.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
