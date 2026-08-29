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

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 border-l border-rule px-4 first:border-l-0 first:pl-0">
      <span className="text-label uppercase text-ink-3">{label}</span>
      <span className="tnum text-subhead">{value}</span>
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
  const capacity = Math.floor(Number(available) / Number(mandate.maxPerClaim));

  return (
    <section className="flex flex-col gap-6 rounded-card border border-rule bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-label uppercase text-ink-3">{organisation}</span>
          <h1 className="text-heading">{eventName}</h1>
          <a
            href={EXPLORER.object(mandate.id).suiscan}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-caption text-ink-3 underline-offset-4 hover:text-ink-2 hover:underline"
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
            className="rounded-control border border-rule px-3 py-1.5 text-caption transition-colors duration-150 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
          >
            Preview revoke
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
          note={`${capacity} more claims at cap`}
        />
        <Stat
          label="Expires"
          value={`in ${daysUntil(mandate.expiryMs)} days`}
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
