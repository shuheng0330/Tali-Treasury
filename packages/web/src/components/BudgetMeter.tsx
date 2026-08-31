import type { Amount } from '@tali/shared';
import { ratioBps, toDisplay } from '@tali/shared';

interface Props {
  settled: Amount;
  committed: Amount;
  available: Amount;
  budget: Amount;
  label?: string;
}

function pct(part: Amount, whole: Amount): number {
  return ratioBps(part, whole) / 100;
}

function Segment({ name, amount, share, className }: { name: string; amount: Amount; share: number; className: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="eyebrow">{name}</span>
      <span className="tnum text-caption text-ink-2">
        {toDisplay(amount)} <span className="text-ink-3">· {share.toFixed(1)}%</span>
      </span>
      <span className={`h-0.5 w-full ${className}`} aria-hidden />
    </div>
  );
}

export function BudgetMeter({ settled, committed, available, budget, label = 'Budget' }: Props) {
  const settledPct = pct(settled, budget);
  const committedPct = pct(committed, budget);
  const availablePct = pct(available, budget);
  const usedUnits = (BigInt(settled) + BigInt(committed)).toString();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="tnum font-display text-title">{toDisplay(available)}</span>
          <span className="text-subhead text-ink-3">remaining</span>
        </div>
        <span className="tnum text-body text-ink-3">of {toDisplay(budget)} {label.toLowerCase()}</span>
      </div>

      <div
        role="meter"
        aria-label={`${label} consumed`}
        aria-valuemin={0}
        aria-valuemax={Number(budget)}
        aria-valuenow={Number(usedUnits)}
        aria-valuetext={`${toDisplay(usedUnits)} of ${toDisplay(budget)} committed or settled, ${toDisplay(available)} remaining`}
        className="relative flex h-3 w-full overflow-hidden rounded-badge bg-sunken"
      >
        <div className="h-full bg-ink" style={{ width: `${settledPct}%` }} />
        <div
          className="h-full bg-ink/40"
          style={{ width: `${committedPct}%` }}
        />
        <span className="absolute inset-y-[-3px] right-0 w-0.5 bg-ink-2" aria-hidden />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Segment name="Settled" amount={settled} share={settledPct} className="bg-ink" />
        <Segment name="Committed" amount={committed} share={committedPct} className="bg-ink/40" />
        <Segment name="Available" amount={available} share={availablePct} className="bg-rule-strong" />
      </div>
    </section>
  );
}
