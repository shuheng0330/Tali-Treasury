import type { Amount, PaymentResult, PolicyDecision } from '@tali/shared';
import { Money } from '@/components/Money';

function Stamp({ label, at }: { label: string; at: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-caption text-ink-3">{label}</span>
      <span className="tnum font-mono text-caption">{at}</span>
    </div>
  );
}

function clock(offsetMs: number) {
  return new Date(Date.now() + offsetMs).toLocaleTimeString('en-GB', { hour12: false });
}

export function Paid({ amount, payment, onDone }: { amount: Amount; payment: PaymentResult; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-6">
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
          <span className="text-label uppercase text-ink-3">Transaction</span>
          <span className="tnum text-caption text-ink-3">Not submitted</span>
        </div>
        <span className="text-body text-ink-2">No digest, checkpoint, gas, or finality exists for this simulated result.</span>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="h-12 rounded-card border border-rule text-subhead font-medium transition-colors duration-150 hover:bg-raised"
      >
        Snap another
      </button>
    </div>
  );
}

export function Held({ amount, decision, onDone }: { amount: Amount; decision: PolicyDecision; onDone: () => void }) {
  const failed = decision.checks.filter((check) => !check.passed);
  const immutableFailure = failed.some((check) => check.onChain);

  return (
    <div className="flex flex-col gap-6">
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
          You do not need to chase anyone. This claim is already in the treasurer&rsquo;s
          review queue, and they will see it the next time they open the treasury.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="h-12 rounded-card bg-accent text-subhead font-semibold text-surface transition-colors duration-150 hover:bg-accent/90"
        >
          Back to my claims
        </button>
      </div>
    </div>
  );
}
