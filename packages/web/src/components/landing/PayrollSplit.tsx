import { toDisplay } from '@tali/shared';
import { sampleStaff } from '@/lib/mock/payroll';

const person = sampleStaff[0]!;

const LINES = [
  { key: 'epf', label: 'EPF', note: 'Employees Provident Fund' },
  { key: 'socso', label: 'SOCSO', note: 'Social Security Organisation' },
  { key: 'eis', label: 'EIS', note: 'Employment Insurance System' },
] as const;

function amountOf(body: 'epf' | 'socso' | 'eis'): string {
  return person.breakdown.bodies.find((entry) => entry.body === body)?.total ?? '0';
}

/**
 * One month of one salary, split the way the Third Schedule splits it.
 *
 * The figures are a fixed sample rather than a second calculator: a rounding
 * difference between this and the real one would put the wrong number on the
 * page that sells the product.
 */
export function PayrollSplit() {
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
      <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-6">
        <span className="eyebrow">The treasury pays</span>
        <p className="tnum font-display text-title">
          RM{toDisplay(person.breakdown.employerCost)}
        </p>
        <p className="text-caption text-ink-3">
          Gross RM{toDisplay(person.breakdown.gross)} plus the employer&rsquo;s share of every
          statutory contribution.
        </p>
      </div>

      <div
        aria-hidden
        className="flex items-center justify-center py-2 text-ink-3 md:py-0 md:pt-11"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="rotate-90 md:rotate-0">
          <path d="M4 12h15M14 7l5 5-5 5" />
        </svg>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-card border border-ok-line bg-ok-soft p-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-body font-medium text-ok">{person.name} takes home</span>
            <span className="tnum font-display text-heading text-ok">
              RM{toDisplay(person.breakdown.net)}
            </span>
          </div>
          <p className="text-caption text-ok/80">Straight to their own wallet.</p>
        </div>

        <ul className="flex flex-col rounded-card border border-rule bg-surface px-5">
          {LINES.map((line, index) => (
            <li
              key={line.key}
              className={`flex items-baseline justify-between gap-4 py-3.5 ${
                index === 0 ? '' : 'border-t border-rule'
              }`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-body">{line.label}</span>
                <span className="truncate text-caption text-ink-3">{line.note}</span>
              </span>
              <span className="tnum shrink-0 text-body">RM{toDisplay(amountOf(line.key))}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
