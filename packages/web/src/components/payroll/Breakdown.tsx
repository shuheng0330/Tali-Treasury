import type { PayrollBreakdown } from '@tali/shared';
import { STATUTORY_BODY_LABEL, toDisplay } from '@tali/shared';

function Row({
  label,
  detail,
  amount,
  strong = false,
  muted = false,
  fractionDigits = 2,
}: {
  label: string;
  detail?: string;
  amount: string;
  strong?: boolean;
  muted?: boolean;
  /** Six for a token amount so a single base unit does not render as 0.00. */
  fractionDigits?: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="flex min-w-0 flex-col">
        <span className={strong ? 'text-body font-medium' : 'text-body text-ink-2'}>
          {label}
        </span>
        {detail ? <span className="text-caption text-ink-3">{detail}</span> : null}
      </span>
      <span
        className={`tnum shrink-0 ${strong ? 'text-subhead font-medium' : 'text-body'} ${
          muted ? 'text-ink-3' : ''
        }`}
      >
        {toDisplay(amount, fractionDigits)}
      </span>
    </div>
  );
}

/**
 * Shows the four amounts that actually leave the treasury, and the two figures
 * either side of them. The gap between gross and employer cost is the point of
 * the screen: statutory contributions sit on top of the wage, not inside it.
 */
export function Breakdown({
  breakdown,
  shortedBody,
}: {
  breakdown: PayrollBreakdown;
  /** Rendered struck through when a body has been deliberately underpaid. */
  shortedBody?: 'epf' | 'socso' | 'eis' | null;
}) {
  return (
    <div className="flex flex-col divide-y divide-rule rounded-card border border-rule bg-surface px-5">
      <Row label="Gross wage" amount={breakdown.gross} strong />

      {breakdown.bodies.map((body) => {
        const shorted = shortedBody === body.body;
        return (
          <div key={body.body} className={shorted ? '-mx-5 border-l-2 border-stop bg-stop-soft px-5' : undefined}>
            <Row
              label={STATUTORY_BODY_LABEL[body.body]}
              detail={`${toDisplay(body.employee)} from wages · ${toDisplay(
                body.employer,
              )} from the employer`}
              amount={shorted ? '1' : body.total}
              muted={shorted}
              fractionDigits={shorted ? 6 : 2}
            />
            {shorted ? (
              <p className="pb-2 text-caption text-stop">
                Set to one base unit instead of {toDisplay(body.total)}.
              </p>
            ) : null}
          </div>
        );
      })}

      <Row label="Net to the worker" amount={breakdown.net} strong />
      <Row
        label="Total cost to the employer"
        detail="Gross plus the employer contributions"
        amount={breakdown.employerCost}
        strong
      />
    </div>
  );
}
