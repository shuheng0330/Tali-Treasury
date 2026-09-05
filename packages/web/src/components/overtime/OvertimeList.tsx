import type { OvertimeClaim } from '@tali/shared';
import {
  MAX_OVERTIME_HOURS_PER_MONTH,
  OVERTIME_KIND_LABEL,
  OVERTIME_KIND_RATE,
  pendingOvertimePay,
  toDisplay,
} from '@tali/shared';

import { byNewest, formatWorkedOn, monthHoursClaimed, parseHours } from '@/lib/overtime-form';
import { Money } from '@/components/Money';
import { OvertimeStatusChip } from './OvertimeStatusChip';

interface Props {
  claims: readonly OvertimeClaim[];
  loading: boolean;
  /** The month the meter is about, as YYYY-MM. */
  month: string;
}

const LIMIT = BigInt(MAX_OVERTIME_HOURS_PER_MONTH) * 100n;

export function OvertimeList({ claims, loading, month }: Props) {
  const hours = monthHoursClaimed(claims, month);
  const centihours = parseHours(hours) ?? 0n;
  const filled = Math.min(100, Number((centihours * 100n) / LIMIT));
  const approved = pendingOvertimePay(claims);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="eyebrow">Your overtime</h2>
          <span className="tnum text-caption text-ink-3">
            {hours} of {MAX_OVERTIME_HOURS_PER_MONTH} hours this month
          </span>
        </div>

        <div
          role="meter"
          aria-label="Overtime hours claimed this month"
          aria-valuemin={0}
          aria-valuemax={MAX_OVERTIME_HOURS_PER_MONTH}
          aria-valuenow={Number(centihours) / 100}
          aria-valuetext={`${hours} of ${MAX_OVERTIME_HOURS_PER_MONTH} statutory hours`}
          className="h-2 w-full overflow-hidden rounded-badge bg-sunken"
        >
          <div className="h-full bg-ink" style={{ width: `${filled}%` }} />
        </div>

        {BigInt(approved) > 0n ? (
          <p className="text-caption text-ink-2">
            <span className="tnum font-medium">{toDisplay(approved)} MYR</span> approved and
            waiting for the next payroll run.
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="rounded-card border border-dashed border-rule px-4 py-8 text-center text-caption text-ink-3">
          Loading your overtime…
        </p>
      ) : claims.length === 0 ? (
        <p className="rounded-card border border-dashed border-rule px-4 py-8 text-center text-caption text-ink-3">
          Nothing yet. Record a day you worked late and it lands here.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-card border border-rule bg-surface">
          {byNewest(claims).map((claim) => (
            <li key={claim.id} className="flex flex-col gap-3 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="tnum text-body font-medium">
                    {formatWorkedOn(claim.workedOn)}
                  </span>
                  <span className="text-caption text-ink-3">
                    {OVERTIME_KIND_LABEL[claim.kind]} · {OVERTIME_KIND_RATE[claim.kind]} ·{' '}
                    <span className="tnum">{claim.hours}</span> h
                  </span>
                </span>
                <Money amount={claim.pay} unit="MYR" size="row" />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <OvertimeStatusChip status={claim.status} />
                {claim.status === 'paid' && claim.runId ? (
                  <span className="text-caption text-ink-3">
                    Run <span className="font-mono">{claim.runId.slice(0, 8)}</span>
                  </span>
                ) : null}
              </div>

              {claim.reason ? (
                <p className="text-caption text-ink-2">{claim.reason}</p>
              ) : null}

              {claim.decisionReason ? (
                <p
                  className={`rounded-control border p-3 text-caption ${
                    claim.status === 'rejected'
                      ? 'border-no-line bg-no-soft text-no'
                      : 'border-rule bg-raised text-ink-2'
                  }`}
                >
                  <span className="font-medium">
                    {claim.status === 'rejected' ? 'The employer said no.' : 'The employer said:'}
                  </span>{' '}
                  <span className="text-ink-2">{claim.decisionReason}</span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
