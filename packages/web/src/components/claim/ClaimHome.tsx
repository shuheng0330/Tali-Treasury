import type { Claim } from '@tali/shared';
import { EXPLORER, ratioBps, toDisplay } from '@tali/shared';
import { Money } from '../Money';
import { ClaimStatusSummary } from './ClaimStatusSummary';
import { FxQuoteSummary } from './FxQuoteSummary';

interface Props {
  eventName: string;
  available: string;
  budget: string;
  claims: Claim[];
  claimsLoading?: boolean;
  onCorrect: (claim: Claim) => void;
  captureDisabled?: boolean;
  onCapture: (file: File) => void;
  onManual: () => void;
}

const CAPTURE_UNAVAILABLE =
  'Submitting a receipt needs the claims backend, which is not answering right now.';

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
  onManual,
}: Props) {
  const used = budget === '0' ? 0 : 100 - ratioBps(available, budget) / 100;
  const needsCorrection = claims.filter((claim) => claim.state === 'needs_correction');

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
          title={captureDisabled ? CAPTURE_UNAVAILABLE : undefined}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onCapture(file);
            e.target.value = '';
          }}
        />
      </label>

      {/* Two ways in, not one. A receipt is the better evidence and stays the
          first button, but a fare paid in an app, a parking coupon that blew
          away and a bank transfer are all real expenses with nothing to
          photograph, and refusing them means the claim is either never made or
          made against an invented receipt. */}
      <button
        type="button"
        onClick={onManual}
        disabled={captureDisabled}
        className="btn btn--ghost btn--block -mt-4"
      >
        No receipt? Enter it by hand
      </button>

      {captureDisabled ? (
        <p className="-mt-4 text-caption text-ink-3">{CAPTURE_UNAVAILABLE}</p>
      ) : null}

      <section className="flex flex-col gap-3">
        {needsCorrection.length > 0 ? (
          <div className="flex flex-col gap-3">
            {needsCorrection.map((claim) => (
              <div
                key={claim.id}
                className="flex flex-col gap-3 rounded-card border border-wait-line bg-wait-soft p-4"
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
          </div>
        ) : null}

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
          <ul className="flex flex-col gap-4">
            {claims.map((claim) => (
              <li
                key={claim.id}
                data-employee-claim-card="true"
                className="flex min-w-0 flex-col gap-3 rounded-card border border-rule bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="break-words text-body font-medium">{claim.merchant}</span>
                  <Money amount={claim.amount} unit={claim.analysis?.currency ?? 'USDC'} size="row" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <ClaimStatusSummary claim={claim} />
                  <FxQuoteSummary claim={claim} variant="compact" />
                  <span className="text-caption text-ink-3" suppressHydrationWarning>
                    Updated {relative(claim.updatedAtMs)}
                  </span>
                </div>
                {claim.state === 'paid' && claim.payment?.digest ? (
                  <a
                    className="link self-start text-caption"
                    href={EXPLORER.tx(claim.payment.digest).suiscan}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View payment transaction
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
