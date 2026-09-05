import type { Amount, OvertimeKind } from '@tali/shared';
import {
  OVERTIME_KIND_LABEL,
  OVERTIME_KIND_RATE,
  STATUTORY_BODY_LABEL,
  fromCentihours,
  overtimePay,
  toDisplay,
} from '@tali/shared';

import {
  INSURED_WAGE_CAP,
  hourlyRate,
  ordinaryRate,
  overtimeHourlyRate,
  parseHours,
  statutoryBases,
} from '@/lib/overtime-form';
import { Money } from '@/components/Money';

interface Props {
  monthlyWage: Amount;
  /** False when no claim has been priced yet and the demo wage is standing in. */
  wageIsOnRecord: boolean;
  kind: OvertimeKind;
  /** Hours as typed, or null while the field does not read as a number. */
  hours: string | null;
}

const KIND_AUTHORITY: Record<OvertimeKind, string> = {
  normal_day: 'Employment Act 1955 s.60A(3)(a)',
  rest_day: 'Employment Act 1955 s.60(3)(c), past normal hours',
  public_holiday: 'Employment Act 1955 s.60D(3)(aa), past normal hours',
};

function Line({
  label,
  detail,
  value,
  unit,
  strong = false,
}: {
  label: string;
  detail?: string;
  value: string;
  unit?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="flex min-w-0 flex-col">
        <span className={strong ? 'text-body font-medium' : 'text-body text-ink-2'}>{label}</span>
        {detail ? <span className="text-caption text-ink-3">{detail}</span> : null}
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        <span className={`tnum ${strong ? 'text-subhead font-medium' : 'text-body'}`}>{value}</span>
        {unit ? <span className="text-caption text-ink-3">{unit}</span> : null}
      </span>
    </div>
  );
}

function BaseChip({ counted, delta }: { counted: boolean; delta: string | null }) {
  const label = counted
    ? delta
      ? `+${delta} overtime`
      : 'Overtime included'
    : 'Overtime excluded';

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-badge border px-2 py-0.5 text-caption font-medium ${
        counted
          ? 'border-accent-line bg-accent-soft text-accent-ink'
          : 'border-dead-line bg-dead-soft text-dead'
      }`}
    >
      <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden>
        {counted ? (
          <path d="M5 1.5 V8.5 M1.5 5 H8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        ) : (
          <path d="M1.5 5 H8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
      {label}
    </span>
  );
}

function BodyBase({
  body,
  base,
  counted,
  delta,
}: {
  body: 'epf' | 'socso' | 'eis';
  base: Amount;
  counted: boolean;
  delta: string | null;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-subhead font-medium">{STATUTORY_BODY_LABEL[body]}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="tnum font-display text-heading">{toDisplay(base)}</span>
          <span className="text-caption text-ink-3">MYR</span>
        </span>
      </div>
      <BaseChip counted={counted} delta={delta} />
    </div>
  );
}

/**
 * The money the hours make, and the wage each body counts once they are in it.
 *
 * The rate rows are the ones a payslip states, rounded to the sen. `overtimePay`
 * divides once at the end instead of three times in sequence, so multiplying the
 * rows together can land a fraction of a sen away from the figure at the top.
 * The figure at the top is the one that is paid.
 */
export function OvertimePreview({ monthlyWage, wageIsOnRecord, kind, hours }: Props) {
  const typed = hours ?? '';
  const centihours = parseHours(typed);
  const worked = centihours !== null && centihours > 0n;
  const pay = worked ? overtimePay(monthlyWage, kind, typed) : '0';
  const bases = statutoryBases(monthlyWage, pay);
  const delta = worked ? toDisplay(pay) : null;
  const readableHours = centihours === null ? '0' : fromCentihours(centihours);

  return (
    <section className="flex flex-col gap-3 rounded-panel border border-rule bg-surface p-5">
      <h2 className="eyebrow">Estimated overtime</h2>
      <Money amount={pay} size="hero" unit="MYR" />

      <p className="text-body text-ink-2">
        {worked
          ? `${readableHours} ${readableHours === '1' ? 'hour' : 'hours'} · ${OVERTIME_KIND_LABEL[kind]} · ${OVERTIME_KIND_RATE[kind]}. Added to next payroll if approved.`
          : 'Enter overtime hours to see your estimate.'}
      </p>
      <p className="text-caption text-ink-3">SOCSO and EIS include overtime · EPF excludes it.</p>

      <details className="border-t border-rule pt-3">
        <summary className="cursor-pointer text-caption font-medium text-ink underline underline-offset-4">
          View calculation details
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <h3 className="eyebrow">Pay rate</h3>
            <div className="mt-2 flex flex-col divide-y divide-rule">
              <Line
                label="Monthly wage of record"
                value={toDisplay(monthlyWage)}
                unit="MYR"
              />
              <Line
                label="Ordinary rate of pay"
                detail="Monthly wage ÷ 26 · s.60I(1A)"
                value={toDisplay(ordinaryRate(monthlyWage))}
                unit="a day"
              />
              <Line
                label="Hourly rate"
                detail="Ordinary rate ÷ 8 normal hours"
                value={toDisplay(hourlyRate(monthlyWage))}
                unit="an hour"
              />
              <Line
                label={`${OVERTIME_KIND_LABEL[kind]} at ${OVERTIME_KIND_RATE[kind]}`}
                detail={KIND_AUTHORITY[kind]}
                value={toDisplay(overtimeHourlyRate(monthlyWage, kind))}
                unit="an hour"
              />
              <Line
                label={`${readableHours} ${readableHours === '1' ? 'hour' : 'hours'} worked`}
                value={toDisplay(pay)}
                unit="MYR"
                strong
              />
            </div>
          </div>

          <div>
            <h3 className="eyebrow">Statutory wage bases</h3>
            <div className="mt-2 flex flex-col divide-y divide-rule">
              <BodyBase body="epf" base={bases.epf} counted={false} delta={null} />
              <BodyBase body="socso" base={bases.socso} counted delta={delta} />
              <BodyBase body="eis" base={bases.eis} counted delta={delta} />
            </div>
          </div>

          {bases.deemed ? (
            <p className="text-caption text-ink-2">
              SOCSO and EIS count{' '}
              <span className="tnum">{toDisplay(INSURED_WAGE_CAP.toString())}</span> MYR at most.
              Act 4 s.5(2) deems a higher wage to be that figure rather than capping the
              contribution afterwards, so overtime counts toward reaching it.
            </p>
          ) : null}

          <p className="text-caption text-ink-2">
            EPF Act 1991 s.2(b) excludes overtime payment from wages. SOCSO (Act 4 s.2(24))
            and EIS (Act 800 s.3) include payment for overtime.
          </p>

          {wageIsOnRecord ? null : (
            <p className="text-caption text-ink-3">
              This preview uses the wage of record for the registered mandate. The server
              prices your submitted claim against the same figure.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
