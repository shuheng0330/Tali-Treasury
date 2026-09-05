import type { PayrollBreakdown, StatutoryBody } from '@tali/shared';
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
 * Why each body's wage base is what it is.
 *
 * Only a month carrying overtime shows these, because that is the only month
 * where the three bases differ — and that difference is the thing the employer
 * is being asked to approve.
 */
const OVERTIME_BASE_NOTE: Record<StatutoryBody, string> = {
  epf: 'overtime excluded, EPF Act 1991 s.2(b)',
  socso: 'overtime included, Act 4 s.2(24)',
  eis: 'overtime included, Act 800 s.3',
};

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
  const unit = breakdown.currency ?? 'MYR';
  const source = breakdown.fxConversion?.source;

  /* The law is written in ringgit. Once a quote exists the rows above carry
     micro-USDC, so the wage bases and the overtime line keep reading off the
     MYR calculation the quote converted rather than being converted twice. */
  const basis = source ?? breakdown;
  const basisUnit = source ? 'MYR' : unit;
  const basisDigits = basisUnit === 'USDC' ? 6 : 2;
  const overtime = BigInt(basis.overtime ?? '0');
  const unpaidLeave = BigInt(basis.unpaidLeave ?? '0');
  const composed = overtime > 0n || unpaidLeave > 0n;

  const parts: string[] = [];
  if (overtime > 0n) parts.push('plus approved overtime');
  if (unpaidLeave > 0n) parts.push('less approved unpaid leave');
  /* The rows above this one are in ringgit and this one is in the token, so
     the ringgit total goes in the caption. Otherwise the three figures read
     as an addition that does not come out. */
  const grossDetail = composed
    ? `Base wage ${parts.join(', ')}${source ? ` · RM ${toDisplay(source.gross)}` : ''}`
    : undefined;

  const baseOf = (body: StatutoryBody): string | undefined =>
    basis.bodies.find((entry) => entry.body === body)?.base;

  return (
    <div className="flex flex-col rounded-card border border-rule bg-surface px-5">
      {source && breakdown.fxConversion ? (
        <div className="border-b border-rule py-4">
          <p className="text-body font-medium">
            RM {toDisplay(source.gross)} gross → {toDisplay(breakdown.gross, 6)} USDC
          </p>
          <p className="text-caption text-ink-3">
            Total employer cost RM {toDisplay(source.employerCost)} →{' '}
            {toDisplay(breakdown.employerCost, 6)} USDC · 1 USD ={' '}
            {breakdown.fxConversion.myrPerUsd} MYR · USDC valued at USD parity
          </p>
        </div>
      ) : null}

      <div className="flex flex-col divide-y divide-rule">
      {composed ? (
        <Row
          label={`Base wage (${basisUnit})`}
          amount={basis.baseWage ?? basis.gross}
          fractionDigits={basisDigits}
        />
      ) : null}

      {overtime > 0n ? (
        <Row
          label={`Approved overtime (${basisUnit})`}
          detail="Outside EPF wages, inside SOCSO and EIS wages"
          amount={basis.overtime ?? '0'}
          fractionDigits={basisDigits}
        />
      ) : null}

      {unpaidLeave > 0n ? (
        <Row
          label={`Approved unpaid leave (${basisUnit})`}
          detail="Off all three wage bases"
          amount={`-${basis.unpaidLeave ?? '0'}`}
          fractionDigits={basisDigits}
        />
      ) : null}

      <Row
        label={`Gross wage (${unit})`}
        detail={grossDetail}
        amount={breakdown.gross}
        strong
        fractionDigits={unit === 'USDC' ? 6 : 2}
      />

      {breakdown.bodies.map((body) => {
        const shorted = shortedBody === body.body;
        const base = baseOf(body.body);
        return (
          <div key={body.body} className={shorted ? '-mx-5 border-l-2 border-no bg-no-soft px-5' : undefined}>
            <Row
              label={STATUTORY_BODY_LABEL[body.body]}
              detail={`${toDisplay(body.employee, unit === 'USDC' ? 6 : 2)} ${unit} from wages · ${toDisplay(
                body.employer,
                unit === 'USDC' ? 6 : 2,
              )} ${unit} from the employer`}
              amount={shorted ? '1' : body.total}
              muted={shorted}
              fractionDigits={shorted || unit === 'USDC' ? 6 : 2}
            />
            {base && overtime > 0n ? (
              <p className="pb-2 text-caption text-ink-3">
                Wage base{' '}
                <span className="tnum">
                  {toDisplay(base, basisDigits)} {basisUnit}
                </span>{' '}
                · {OVERTIME_BASE_NOTE[body.body]}
              </p>
            ) : null}
            {shorted ? (
              <p className="pb-2 text-caption text-no">
                Set to one base unit instead of {toDisplay(body.total)}.
              </p>
            ) : null}
          </div>
        );
      })}

      <Row label={`Net to the worker (${unit})`} amount={breakdown.net} strong fractionDigits={unit === 'USDC' ? 6 : 2} />
      <Row
        label={`Total cost to the employer (${unit})`}
        detail="Gross plus the employer contributions"
        amount={breakdown.employerCost}
        strong
        fractionDigits={unit === 'USDC' ? 6 : 2}
      />
      </div>
    </div>
  );
}
