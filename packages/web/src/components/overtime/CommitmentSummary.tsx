import type { Amount, StatutoryBody, StatutorySplit } from '@tali/shared';
import { STATUTORY_BODIES, STATUTORY_BODY_LABEL, toDisplay } from '@tali/shared';
import { PAYROLL_ABORT_CODE } from '@tali/treasury-sui';

import type { Commitment } from '../../lib/approval-summary';

export type Projection =
  | { status: 'loading' }
  | { status: 'ready'; commitment: Commitment }
  | { status: 'unavailable'; reason: string };

/**
 * Why each body is measured against the wage it is measured against. This is
 * the sentence the product exists to be able to say, so it is on the screen
 * rather than in a tooltip.
 */
const BASE_NOTE: Record<StatutoryBody, string> = {
  epf: 'overtime is outside EPF wages (EPF Act 1991 s.2(b))',
  socso: 'overtime is inside SOCSO wages (Act 4 s.2(24))',
  eis: 'overtime is inside EIS wages (Act 800 s.3)',
};

function Line({
  label,
  detail,
  before,
  after,
  unit,
  strong = false,
}: {
  label: string;
  detail?: string;
  before: Amount;
  after: Amount;
  unit: 'MYR' | 'USDC';
  strong?: boolean;
}) {
  const digits = unit === 'USDC' ? 6 : 2;
  const changed = before !== after;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 px-4 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={strong ? 'text-body font-medium' : 'text-body text-ink-2'}>{label}</span>
        {detail ? <span className="text-caption text-ink-3">{detail}</span> : null}
      </span>
      <span className="tnum justify-self-end text-caption text-ink-3">
        {toDisplay(before, digits)}
      </span>
      <span
        className={`tnum justify-self-end text-caption ${
          changed ? 'font-medium text-ink' : 'text-ink-3'
        }`}
      >
        {toDisplay(after, digits)}
      </span>
    </div>
  );
}

function baseOf(split: StatutorySplit, body: StatutoryBody): Amount {
  return split.bodies.find((entry) => entry.body === body)?.base ?? split.gross;
}

function totalOf(split: StatutorySplit, body: StatutoryBody): Amount {
  return split.bodies.find((entry) => entry.body === body)?.total ?? '0';
}

function EpfFloor({ commitment }: { commitment: Commitment }) {
  const { epfAfter, epfCeiling, epfSpare, after } = commitment;
  if (!epfAfter) return null;

  const overtime = after.overtime ?? '0';

  if (!epfAfter.clears) {
    const short = (BigInt(epfAfter.required) - BigInt(epfAfter.total)).toString();

    return (
      <p className="tnum rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">
        <span className="font-medium">
          Approving takes EPF under the floor this mandate fixed on chain.
        </span>{' '}
        <span className="text-ink-2">
          The contract measures every floor against the single gross it is handed, and
          overtime raises gross without raising the EPF base. EPF stays at RM{' '}
          {toDisplay(epfAfter.total)} while gross becomes RM {toDisplay(after.gross)} — that
          is {epfAfter.actualBps} basis points against a floor of {epfAfter.minBps}, RM{' '}
          {toDisplay(short)} short. The run is refused on abort{' '}
          {PAYROLL_ABORT_CODE.STATUTORY_SHORT} unless EPF is paid above what the law asks
          for.
          {epfCeiling !== null ? (
            <>
              {' '}
              This wage carries RM {toDisplay(epfCeiling)} of overtime at that floor;
              approving takes it to RM {toDisplay(overtime)}.
            </>
          ) : null}
        </span>
      </p>
    );
  }

  return (
    <p className="tnum rounded-card border border-rule bg-raised p-4 text-caption text-ink-2">
      <span className="font-medium text-ink">EPF still clears its floor.</span>{' '}
      {epfAfter.actualBps} basis points of gross against a floor of {epfAfter.minBps}.
      {epfSpare !== null ? (
        <> A further RM {toDisplay(epfSpare)} of overtime fits before it does not.</>
      ) : null}
    </p>
  );
}

function Spend({ commitment }: { commitment: Commitment }) {
  const spend = commitment.spendAfter;
  if (!spend) return null;

  const share = BigInt(spend.spendable) > 0n
    ? Number((BigInt(spend.cost) * 100n) / BigInt(spend.spendable))
    : 100;
  const blocked = !spend.withinBudget || !spend.withinPerRun;

  return (
    <div
      className={`flex flex-col gap-3 rounded-card border p-4 ${
        blocked ? 'border-no-line bg-no-soft' : 'border-rule bg-raised'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-body text-ink-2">The mandate would spend</span>
        <span className="tnum text-subhead font-medium">
          {toDisplay(spend.cost, 6)}{' '}
          <span className="text-caption font-normal text-ink-3">USDC</span>
        </span>
      </div>

      <div
        role="meter"
        aria-label="Share of the mandate's spendable budget"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, share)}
        aria-valuetext={`${toDisplay(spend.cost, 6)} of ${toDisplay(spend.spendable, 6)} USDC spendable`}
        className="flex h-2 w-full overflow-hidden rounded-badge bg-sunken"
      >
        <div
          className={blocked ? 'h-full bg-no' : 'h-full bg-ink'}
          style={{ width: `${Math.min(100, share)}%` }}
        />
      </div>

      {blocked ? (
        <p className="tnum text-caption text-no">
          <span className="font-medium">
            {spend.withinBudget
              ? 'This run is above the mandate’s per-run limit.'
              : 'The mandate cannot pay this run.'}
          </span>{' '}
          <span className="text-ink-2">
            {spend.withinBudget
              ? `The limit is ${toDisplay(spend.maxPerRun, 6)} USDC and was fixed when the mandate was created. Abort ${PAYROLL_ABORT_CODE.ABOVE_RUN_LIMIT}.`
              : `It holds ${toDisplay(spend.spendable, 6)} USDC that no salary stream has reserved, and there is no way to top it up. Abort ${PAYROLL_ABORT_CODE.PAYROLL_INSUFFICIENT} — nothing is paid, not even the part it could afford.`}
          </span>
        </p>
      ) : (
        <p className="tnum text-caption text-ink-3">
          {toDisplay(spend.remaining ?? '0', 6)} USDC would be left of the{' '}
          {toDisplay(spend.spendable, 6)} USDC the mandate can still spend. It cannot be
          topped up.
        </p>
      )}

      {commitment.myrPerUsd ? (
        <p className="tnum text-caption text-ink-3">
          Projected at 1 USD = {commitment.myrPerUsd} MYR, the rate quoted for these
          figures. Payroll quotes again when it runs.
        </p>
      ) : null}
    </div>
  );
}

/**
 * What the approver is committing, before the click rather than after it.
 *
 * Both columns are a projection of the next payroll run, never a reading of the
 * chain: nothing has been signed and the approval itself moves no money. The
 * mandate figures underneath are the live read the page was rendered with.
 */
export function CommitmentSummary({ projection }: { projection: Projection }) {
  if (projection.status === 'loading') {
    return (
      <p className="rounded-card border border-rule bg-raised p-4 text-caption text-ink-2">
        Working out what this commits…
      </p>
    );
  }

  if (projection.status === 'unavailable') {
    return (
      <p className="rounded-card border border-wait-line bg-wait-soft p-4 text-caption text-wait">
        <span className="font-medium">
          What this commits to the next run could not be worked out.
        </span>{' '}
        <span className="text-ink-2">
          {projection.reason} The decision is still yours to record, but the effect on the
          run is not shown rather than guessed at.
        </span>
      </p>
    );
  }

  const { before, after } = projection.commitment;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col overflow-hidden rounded-card border border-rule bg-canvas">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 border-b border-rule px-4 py-2">
          <span className="eyebrow">The next payroll run</span>
          <span className="eyebrow justify-self-end">Now</span>
          <span className="eyebrow justify-self-end">After</span>
        </div>

        <div className="flex flex-col divide-y divide-rule">
          <Line
            label="Total wages payable"
            detail="The one gross every mandate floor is measured against"
            before={before.gross}
            after={after.gross}
            unit="MYR"
            strong
          />

          {STATUTORY_BODIES.map((body) => (
            <Line
              key={body}
              label={STATUTORY_BODY_LABEL[body]}
              detail={`On RM ${toDisplay(baseOf(after, body))} — ${BASE_NOTE[body]}`}
              before={totalOf(before, body)}
              after={totalOf(after, body)}
              unit="MYR"
            />
          ))}

          <Line
            label="Net to the worker"
            before={before.net}
            after={after.net}
            unit="MYR"
            strong
          />
          <Line
            label="Total cost to the employer"
            detail="Gross plus the employer’s side of all three"
            before={before.employerCost}
            after={after.employerCost}
            unit="MYR"
            strong
          />
        </div>
      </div>

      <p className="text-caption text-ink-3">
        A projection of the next run, not a reading of the chain: approving records a
        decision and moves no money. Computed for the class this mandate covers — local
        staff under 60, the only class its floors describe.
      </p>

      <EpfFloor commitment={projection.commitment} />
      <Spend commitment={projection.commitment} />
    </div>
  );
}
