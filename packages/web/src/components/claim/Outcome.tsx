import type { Claim } from '@tali/shared';
import { Money } from '@/components/Money';

export function Submitted({ claim, onDone }: { claim: Claim; onDone: () => void }) {
  const currency = claim.analysis?.currency ?? 'USDC';
  const needsQuote = currency !== 'USDC';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ok" aria-hidden>
          <path d="M4 12.5 9.5 18 20 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <Money amount={claim.amount} unit={currency} size="hero" />
        <p className="text-heading">Claim submitted</p>
        <p className="text-body text-ink-2">
          {needsQuote
            ? `This ${currency} receipt needs an explicit USDC conversion quote before payment.`
            : 'The server will evaluate it against the treasury rules.'}
        </p>
      </div>

      <div className="rounded-card border border-rule bg-surface p-4 text-caption text-ink-2">
        Nothing has been paid yet. The treasurer can run the server policy evaluation from the treasury queue.
      </div>

      <button type="button" onClick={onDone} className="btn btn--primary btn--block btn--lg">
        Back to my claims
      </button>
    </div>
  );
}
