'use client';

import { useState } from 'react';
import { toDisplay } from '@tali/shared';
import type { SampleEmployee } from '@/lib/mock/payroll';
import { Breakdown } from './Breakdown';

export function PayrollDesk({ staff }: { staff: SampleEmployee[] }) {
  const [selected, setSelected] = useState(staff[0]);

  const monthlyCost = staff.reduce(
    (sum, person) => sum + BigInt(person.breakdown.employerCost),
    0n,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="eyebrow">Staff on this mandate</span>

        <div className="flex flex-col gap-2">
          {staff.map((person) => {
            const active = person.address === selected.address;
            return (
              <button
                key={person.address}
                type="button"
                onClick={() => setSelected(person)}
                aria-pressed={active}
                className={`flex items-baseline justify-between gap-4 rounded-control border px-4 py-3 text-left transition-colors duration-150 ${
                  active
                    ? 'border-ink bg-raised'
                    : 'border-rule bg-surface hover:border-rule-strong'
                }`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-body font-medium">{person.name}</span>
                  <span className="truncate text-caption text-ink-3">{person.role}</span>
                </span>
                <span className="tnum shrink-0 text-body">
                  {toDisplay(person.breakdown.gross)}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-caption text-ink-3">
          Every person here is a local worker under 60. The mandate&rsquo;s floors are set
          for that class, so a different class needs its own mandate.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="eyebrow">{selected.name}&rsquo;s payroll run</span>
        <Breakdown breakdown={selected.breakdown} />
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-body text-ink-2">This month, all staff</span>
          <span className="tnum text-title">{toDisplay(monthlyCost.toString())}</span>
        </div>
        <button type="button" className="btn btn--primary btn--block" disabled>
          Run payroll
        </button>
        <p className="text-caption text-ink-3">
          Running payroll needs the payroll module on chain. Until then this screen shows
          what would be sent, not what was.
        </p>
      </div>
    </div>
  );
}
