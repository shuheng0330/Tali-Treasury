'use client';

import { toDisplay } from '@tali/shared';

import { Select } from '@/components/Select';
import {
  grossAfterUnpaidLeave,
  grossProblem,
  MAX_UNPAID_LEAVE_DAYS,
  unpaidLeaveProblem,
  type WageClassValue,
} from '@/lib/payroll-wage';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 rounded-control border border-rule bg-canvas px-3 py-2">
      <span className="text-caption text-ink-2">{label}</span>
      {children}
      {hint ? <span className="text-caption text-ink-3">{hint}</span> : null}
    </label>
  );
}

/**
 * The wage, and the three things that change what it costs.
 *
 * The rates genuinely turn on all four: a worker aged 60 or over pays no EPF and
 * the employer's share drops to 4%, EIS stops entirely, and a foreign worker
 * contributes a flat 2% on each side. But three of them arrive with an answer
 * and almost never change, and standing in a column of equal boxes they read as
 * four questions rather than one. They are folded, and the fold's own summary
 * line carries their current values so nothing has to be opened to be seen.
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
  const ageProblem = value.age < 16 || value.age > 100;

  return (
    <div className="flex flex-col gap-3">
      <Field label="Monthly gross wage (RM)">
        <input
          value={value.gross}
          inputMode="decimal"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, gross: event.target.value })}
          className="tnum bg-transparent text-lead outline-none disabled:opacity-60"
        />
      </Field>

      {problem ? (
        <p className="text-caption text-no" role="alert">
          {problem}
        </p>
      ) : null}

      <details
        className="disclosure-card bg-canvas"
        open={Boolean(leaveProblem) || ageProblem || undefined}
      >
        <summary>
          {value.age} years old ·{' '}
          {value.citizenship === 'local' ? 'Malaysian' : 'Foreign worker'} ·{' '}
          {value.unpaidLeaveDays === 0
            ? 'no unpaid leave'
            : `${value.unpaidLeaveDays} day${value.unpaidLeaveDays === 1 ? '' : 's'} unpaid leave`}
        </summary>

        <div className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age" hint={value.age >= 60 ? 'Retirement rates apply' : undefined}>
              <input
                type="number"
                min={16}
                max={100}
                value={value.age}
                disabled={disabled}
                onChange={(event) => onChange({ ...value, age: Number(event.target.value) || 0 })}
                className="tnum bg-transparent text-body outline-none disabled:opacity-60"
              />
            </Field>

            <Select
              label="Status"
              value={value.citizenship}
              disabled={disabled}
              onChange={(citizenship) => onChange({ ...value, citizenship })}
              options={[
                { value: 'local', label: 'Malaysian' },
                { value: 'foreign', label: 'Foreign worker', note: 'EPF at 2%' },
              ]}
            />
          </div>

          <Field
            label="Unpaid leave (days this month)"
            hint="A day not worked is a day not paid, at one twenty-sixth of the month."
          >
            <input
              type="number"
              min={0}
              max={MAX_UNPAID_LEAVE_DAYS}
              value={value.unpaidLeaveDays}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  unpaidLeaveDays: Math.trunc(Number(event.target.value)) || 0,
                })
              }
              className="tnum bg-transparent text-body outline-none disabled:opacity-60"
            />
          </Field>

          {ageProblem ? (
            <p className="text-caption text-no" role="alert">
              An age between 16 and 100.
            </p>
          ) : null}
        </div>
      </details>

      {/* Outside the fold on purpose. Both of these say the wage is not the
          number typed above, and that has to be visible without opening
          anything before somebody presses Run payroll. */}
      {leaveProblem ? (
        <p className="text-caption text-no" role="alert">
          {leaveProblem}
        </p>
      ) : reduced ? (
        <p className="text-caption text-ink-2">
          <span className="font-medium">
            Payable this month: <span className="tnum">{toDisplay(afterLeave.toString())}</span>{' '}
            MYR
          </span>{' '}
          — down from <span className="tnum">{value.gross}</span>. EPF is worked out on the
          lower figure, not scaled down afterwards.
        </p>
      ) : null}
    </div>
  );
}
