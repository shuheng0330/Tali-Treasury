import type { MandateView } from '@tali/shared';
import { EXPLORER, mandateStatus, subtract, toDisplay } from '@tali/shared';
import { BudgetMeter } from '@/components/BudgetMeter';
import { StatusChip } from '@/components/StatusChip';

interface Props {
  eventName: string;
  organisation: string;
  mandate: MandateView;
  committed: string;
  onRevoke: () => void;
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note: string }) {
  return (
    <div className="flex flex-col gap-1 border-l border-rule px-4 first:border-l-0 first:pl-0">
      <span className="eyebrow">{label}</span>
      <span className="tnum font-display text-subhead">{value}</span>
      <span className="text-caption text-ink-3">{note}</span>
    </div>
  );
}

function daysUntil(atMs: number) {
  return Math.max(0, Math.ceil((atMs - Date.now()) / 86_400_000));
}

export function MandateHeader({ eventName, organisation, mandate, committed, onRevoke }: Props) {
  const status = mandateStatus(mandate);
  const available = subtract(mandate.remainingBudget, committed);
  /* BigInt, not Number: these are base units, and 6 decimals of a large budget
     leaves the double short. Committed can exceed what remains — nothing stops
     a treasurer approving past the budget — so the count is floored at zero
     rather than rendered as "-1 more claims at cap". */
  const perClaim = BigInt(mandate.maxPerClaim);
  const capacity =
    perClaim > 0n && BigInt(available) > 0n ? BigInt(available) / perClaim : 0n;

  return (
    <section className="flex flex-col gap-6 rounded-panel border border-rule bg-surface p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{organisation}</span>
          <h1 className="text-heading">{eventName}</h1>
          <a
            href={EXPLORER.object(mandate.id).suiscan}
            target="_blank"
            rel="noreferrer"
            className="link font-mono text-caption text-ink-3"
          >
            {mandate.id.slice(0, 8)}…{mandate.id.slice(-6)}
          </a>
        </div>

        <div className="flex items-center gap-3">
          <StatusChip status={status} />
          <button
            type="button"
            onClick={onRevoke}
            disabled={status !== 'active'}
            className="btn btn--danger h-9 px-4 text-label"
          >
            Revoke mandate
          </button>
        </div>
      </div>

      <BudgetMeter
        settled={mandate.amountSpent}
        committed={committed}
        available={available}
        budget={mandate.initialBudget}
      />

      <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
        <Stat
          label="Max per claim"
          value={toDisplay(mandate.maxPerClaim)}
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
        <Stat label="Approved payees" value={String(mandate.approvedRecipients.length)} note="on the allowlist" />
        <Stat label="Enforced by" value="Move" note={`module treasury`} />
      </div>

      <p className="border-t border-rule pt-4 text-caption text-ink-3">
        The per-claim cap, the budget, the expiry, the allowlist and the revoked flag are
        enforced on Sui by the <span className="font-mono">treasury</span> module. Not by
        this app.
      </p>
    </section>
  );
}
