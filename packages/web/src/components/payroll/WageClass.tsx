'use client';

import { toDisplay } from '@tali/shared';

import {
  grossAfterUnpaidLeave,
  grossProblem,
  MAX_UNPAID_LEAVE_DAYS,
  unpaidLeaveProblem,
  type WageClassValue,
} from '@/lib/payroll-wage';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 rounded-control border border-rule bg-surface px-3 py-2">
      <span className="text-caption text-ink-2">{label}</span>
      {children}
      {hint ? <span className="text-caption text-ink-3">{hint}</span> : null}
    </label>
  );
}

/**
 * The three inputs that decide the whole statutory split.
 *
 * They are on screen because the rates genuinely turn on them: a worker aged 60
 * or over pays no EPF and the employer's share drops to 4%, EIS stops entirely,
 * and a foreign worker contributes a flat 2% on each side. A demo pinned to one
 * class shows none of that, and the arithmetic underneath it is the part worth
 * showing.
 */
export function WageClass({
  value,
  onChange,
  disabled = false,
}: {
  value: WageClassValue;
  onChange: (next: WageClassValue) => void;
  disabled?: boolean;
}) {
  const problem = grossProblem(value.gross);
  const leaveProblem = unpaidLeaveProblem(value);
  const afterLeave = grossAfterUnpaidLeave(value);
  const reduced = value.unpaidLeaveDays > 0 && afterLeave !== null && problem === null;

  return (
    <div className="flex flex-col gap-2">
      <Field label="Monthly gross wage (RM)">
        <input
          value={value.gross}
          inputMode="decimal"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, gross: event.target.value })}
          className="tnum bg-transparent text-title outline-none disabled:opacity-60"
        />
      </Field>

      {problem ? (
        <p className="text-caption text-no" role="alert">
          {problem}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Age" hint={value.age >= 60 ? 'Retirement rates apply' : undefined}>
          <input
            type="number"
            min={16}
            max={100}
            value={value.age}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, age: Number(event.target.value) || 0 })
            }
            className="tnum bg-transparent text-body outline-none disabled:opacity-60"
          />
        </Field>

        <Field label="Status">
          <select
            value={value.citizenship}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                citizenship: event.target.value === 'foreign' ? 'foreign' : 'local',
              })
            }
            className="bg-transparent text-body outline-none disabled:opacity-60"
          >
            <option value="local">Malaysian</option>
            <option value="foreign">Foreign worker</option>
          </select>
        </Field>
      </div>

      <Field
        label="Unpaid leave (days this month)"
        hint={`A day not worked is a day not paid. Prorated at one twenty-sixth of the month, the ordinary rate of pay.`}
      >
        <input
          type="number"
          min={0}
          max={MAX_UNPAID_LEAVE_DAYS}
          value={value.unpaidLeaveDays}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, unpaidLeaveDays: Math.trunc(Number(event.target.value)) || 0 })
          }
          className="tnum bg-transparent text-body outline-none disabled:opacity-60"
        />
      </Field>

      {leaveProblem ? (
        <p className="text-caption text-no" role="alert">
          {leaveProblem}
        </p>
      ) : reduced ? (
        <p className="text-caption text-ink-2">
          <span className="font-medium">
            Payable this month: <span className="tnum">{toDisplay(afterLeave.toString())}</span> MYR
          </span>{' '}
          — down from <span className="tnum">{value.gross}</span>. The statutory split below is
          computed on the reduced wage, not scaled down afterwards, so EPF can fall into a
          lower Third Schedule band.
        </p>
      ) : null}

      {value.age < 16 || value.age > 100 ? (
        <p className="text-caption text-no" role="alert">
          An age between 16 and 100.
        </p>
      ) : null}
    </div>
  );
}
