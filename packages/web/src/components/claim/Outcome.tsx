import type { Amount, Claim, PaymentResult, PolicyDecision } from '@tali/shared';
import { Money } from '@/components/Money';

function Stamp({ label, at }: { label: string; at: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-caption text-ink-3">{label}</span>
      <span className="tnum font-mono text-caption">{at}</span>
    </div>
  );
}

function NotSaved({ saveError }: { saveError: string | null }) {
  if (!saveError) return null;

  return (
    <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">
      <span className="font-medium">{saveError}</span>{' '}
      <span className="text-ink-2">
        Nothing below reached the treasurer, and it will not appear in your claim history.
      </span>
    </p>
  );
}

function clock(offsetMs: number) {
  return new Date(Date.now() + offsetMs).toLocaleTimeString('en-GB', { hour12: false });
}

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

export function Paid({
  amount,
  payment,
  saveError,
  onDone,
}: {
  amount: Amount;
  payment: PaymentResult;
  saveError: string | null;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <NotSaved saveError={saveError} />
      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ok" aria-hidden>
          <path d="M13 2 L4 14h7l-1 8 9-12h-7z" strokeLinejoin="round" />
        </svg>
        <Money amount={amount} size="hero" />
        <p className="text-body text-ink-2">sent to your wallet</p>
        <p className="text-caption text-wait">Simulated result — no transaction was signed or submitted.</p>
      </div>

      <div className="rounded-card border border-rule bg-surface px-4 py-2">
        <Stamp label="Submitted" at={clock(-41_000)} />
        <Stamp label="Approved" at={clock(-40_000)} />
        <Stamp label="Confirmed" at={clock(0)} />
      </div>

      <div className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">Transaction</span>
          <span className="tnum text-caption text-ink-3">Not submitted</span>
        </div>
        <span className="text-body text-ink-2">No digest, checkpoint, gas, or finality exists for this simulated result.</span>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="btn btn--ghost btn--block btn--lg"
      >
        Snap another
      </button>
    </div>
  );
}

export function Held({
  amount,
  decision,
  saveError,
  onDone,
}: {
  amount: Amount;
  decision: PolicyDecision;
  saveError: string | null;
  onDone: () => void;
}) {
  const failed = decision.checks.filter((check) => !check.passed);
  const immutableFailure = failed.some((check) => check.onChain);

  return (
    <div className="flex flex-col gap-6">
      <NotSaved saveError={saveError} />
      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.7" className="text-wait" aria-hidden>
          <path d="M12 3 3.5 19.5h17z" strokeLinejoin="round" />
          <path d="M12 9.5v4.2M12 16.6v.1" strokeLinecap="round" />
        </svg>
        <Money amount={amount} size="lead" />
        <p className="text-heading">Held for review</p>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-wait-line bg-wait-soft p-4">
        {failed.map((check) => (
          <div key={check.rule} className="flex flex-col gap-0.5">
            <span className="text-body text-wait">{check.label}</span>
            <span className="tnum text-caption text-ink-2">{check.detail}</span>
          </div>
        ))}
        <p className="text-caption text-ink-2">
          Nothing was paid and nothing left the treasury.{' '}
          {immutableFailure
            ? 'This violates an on-chain rule and cannot be manually overridden under the current mandate.'
            : 'The treasurer can review this uncertain claim.'}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-caption text-ink-3">
          {saveError
            ? 'Because it was not saved, no treasurer will see it. Photograph the receipt again once the backend is reachable.'
            : 'You do not need to chase anyone. This claim is already in the treasurer’s review queue, and they will see it the next time they open the treasury.'}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="btn btn--primary btn--block btn--lg"
        >
          Back to my claims
        </button>
      </div>
    </div>
  );
}
