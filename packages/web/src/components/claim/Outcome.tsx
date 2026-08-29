import type { Amount, PaymentResult, PolicyDecision } from '@tali/shared';
import { EXPLORER } from '@tali/shared';
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
  const digest = payment.digest ?? '';
  const links = EXPLORER.tx(digest);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ok" aria-hidden>
          <path d="M13 2 L4 14h7l-1 8 9-12h-7z" strokeLinejoin="round" />
        </svg>
        <Money amount={amount} size="hero" />
        <p className="text-body text-ink-2">sent to your wallet</p>
      </div>

      <div className="rounded-card border border-rule bg-surface px-4 py-2">
        <Stamp label="Submitted" at={clock(-41_000)} />
        <Stamp label="Approved" at={clock(-40_000)} />
        <Stamp label="Confirmed" at={clock(0)} />
      </div>

      <div className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-label uppercase text-ink-3">Transaction</span>
          <span className="tnum text-caption text-ink-3">
            {payment.finalityMs} ms · checkpoint {payment.checkpoint}
          </span>
        </div>
        <span className="truncate font-mono text-caption">{digest}</span>
        <div className="flex flex-wrap gap-3 pt-1">
          <a href={links.suiscan} target="_blank" rel="noreferrer" className="text-caption text-accent underline underline-offset-4">
            Suiscan
          </a>
          <a href={links.suivision} target="_blank" rel="noreferrer" className="text-caption text-accent underline underline-offset-4">
            SuiVision
          </a>
        </div>
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
          Nothing was paid and nothing left the treasury. Your treasurer can approve this
          one manually.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="h-12 rounded-card bg-accent text-subhead font-semibold text-surface transition-colors duration-150 hover:bg-accent/90"
        >
          Ask the treasurer
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-12 rounded-card border border-rule text-subhead font-medium transition-colors duration-150 hover:bg-raised"
        >
          Back to my claims
        </button>
      </div>
    </div>
  );
}
