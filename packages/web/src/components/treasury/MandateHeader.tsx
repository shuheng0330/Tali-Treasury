import type { MandateView } from '@tali/shared';
import { EXPLORER, mandateStatus, subtract, toDisplay } from '@tali/shared';
import { StatusChip } from '@/components/StatusChip';

interface Props {
  eventName: string;
  organisation: string;
  mandate: MandateView;
  committed: string;
  onRevoke: () => void;
  /**
   * Whether the reader is the event treasurer. The button was previously
   * enabled for anybody at all — not merely anybody signed in — on a control
   * that pulls the agent's permission to spend.
   */
  canRevoke: boolean;
  /** Why not, when they are not. Rendered beside the button, not instead. */
  revokeNotice: string | null;
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-control bg-raised p-3">
      <span className="eyebrow">{label}</span>
      <span className="tnum font-display text-subhead">{value}</span>
      {note ? <span className="text-caption text-ink-3">{note}</span> : null}
    </div>
  );
}

function daysUntil(atMs: number) {
  return Math.max(0, Math.ceil((atMs - Date.now()) / 86_400_000));
}

export function MandateHeader({
  eventName,
  organisation,
  mandate,
  committed,
  onRevoke,
  canRevoke,
  revokeNotice,
}: Props) {
  const status = mandateStatus(mandate);
  const available = subtract(mandate.remainingBudget, committed);
  const displayName =
    eventName.toLowerCase() === 'single-wallet reimbursement demo'
      ? 'Expense treasury'
      : eventName;
  /* BigInt, not Number: these are base units, and 6 decimals of a large budget
     leaves the double short. Committed can exceed what remains — nothing stops
     a treasurer approving past the budget — so the count is floored at zero
     rather than rendered as "-1 more claims at cap". */
  const perClaim = BigInt(mandate.maxPerClaim);
  const capacity =
    perClaim > 0n && BigInt(available) > 0n ? BigInt(available) / perClaim : 0n;

  return (
    <section className="flex flex-col gap-5 rounded-panel border border-rule bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{organisation}</span>
          <h1 className="text-heading">{displayName}</h1>
          <a
            href={EXPLORER.object(mandate.id).suiscan}
            target="_blank"
            rel="noreferrer"
            className="link font-mono text-caption text-ink-3"
          >
            {mandate.id.slice(0, 8)}…{mandate.id.slice(-6)}
          </a>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <StatusChip status={status} />
            <button
              type="button"
              onClick={onRevoke}
              disabled={status !== 'active' || !canRevoke}
              className="btn btn--danger min-h-11 px-4 text-label"
            >
              Revoke mandate
            </button>
          </div>
          {revokeNotice ? (
            <p className="max-w-xs text-right text-caption text-ink-3">{revokeNotice}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="rounded-card bg-ink p-5 text-canvas">
          <p className="eyebrow text-canvas/70">Available balance</p>
          <p className="tnum mt-2 font-display text-title">{toDisplay(available)} <span className="text-body text-canvas/70">USDC</span></p>
          <p className="mt-1 text-caption text-canvas/70">of {toDisplay(mandate.initialBudget)} USDC budget</p>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-card border border-rule bg-canvas p-4">
            <dt className="eyebrow">Settled</dt>
            <dd className="tnum mt-2 font-display text-subhead">{toDisplay(mandate.amountSpent)}</dd>
          </div>
          <div className="rounded-card border border-rule bg-canvas p-4">
            <dt className="eyebrow">Committed</dt>
            <dd className="tnum mt-2 font-display text-subhead">{toDisplay(committed)}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
        <Stat
          label="Claim limit"
          value={`${toDisplay(mandate.maxPerClaim)} USDC`}
          note={
            BigInt(available) < 0n
              ? 'approved past what remains'
              : `${capacity} more claims at cap`
          }
        />
        <Stat
          label="Expires"
          value={<span suppressHydrationWarning>{`in ${daysUntil(mandate.expiryMs)} days`}</span>}
          note={new Date(mandate.expiryMs).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        />
        <Stat label="Approved payees" value={String(mandate.approvedRecipients.length)} />
      </div>

      <details className="disclosure-card">
        <summary>View Treasury Rules</summary>
        <div className="mt-4 flex flex-col gap-3 text-caption text-ink-2">
          <p className="font-display text-body font-medium text-ink">Protected on Sui</p>
          <ul className="grid list-disc gap-2 pl-5 sm:grid-cols-2">
            <li>Budget and per-claim limits</li>
            <li>Approved payee allowlist</li>
            <li>Expiry enforcement</li>
            <li>Revocation enforcement</li>
          </ul>
          <a
            href={EXPLORER.object(mandate.id).suiscan}
            target="_blank"
            rel="noreferrer"
            className="link min-h-11 self-start py-3"
          >
            View Mandate on Suiscan
          </a>
        </div>
      </details>
    </section>
  );
}
