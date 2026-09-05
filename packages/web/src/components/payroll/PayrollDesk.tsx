'use client';

import { useEffect, useState } from 'react';
import type { PayrollBreakdown, PayrollConfigurationView } from '@tali/shared';
import { toDisplay } from '@tali/shared';
import { tryPreviewPayroll, tryRunPayroll } from '@/lib/api/payroll';
import type { Source } from '@/lib/api/demo';
import { DataNotice } from '@/components/DataNotice';
import { Breakdown } from './Breakdown';
import { ClassNote } from './ClassNote';
import {
  grossAfterUnpaidLeave,
  grossProblem,
  unpaidLeaveProblem,
  type WageClassValue,
} from '@/lib/payroll-wage';
import { WageClass } from './WageClass';
import { RoleNotice } from '@/components/RoleNotice';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { payrollRunNote, type PayrollStage } from '@/lib/chain-status';
import { EMPLOYER_WALLET } from '@/lib/demo-config';
import { EMPLOYER_COPY, walletAccess } from '@/lib/wallet-access';

interface RunState {
  status: 'idle' | 'running' | 'paid' | 'refused' | 'unknown';
  digest?: string | null;
  message?: string;
}

export function PayrollDesk({
  configuration,
  runsAreLive,
  /* Read on the server and handed down: the package and mandate ids are not
     NEXT_PUBLIC_, so this component cannot work the stage out for itself. */
  stage,
}: {
  configuration: PayrollConfigurationView;
  runsAreLive: boolean;
  stage: PayrollStage;
}) {
  const { address } = useWalletSession();
  const access = walletAccess(address, EMPLOYER_WALLET, EMPLOYER_COPY);

  const [wage, setWage] = useState<WageClassValue>({
    gross: '3000.00',
    age: 30,
    citizenship: 'local',
    unpaidLeaveDays: 0,
  });
  const [breakdown, setBreakdown] = useState<PayrollBreakdown | null>(null);
  const [source, setSource] = useState<Source>('live');
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<RunState>({ status: 'idle' });

  /* The wage after unpaid leave, which is the figure everything downstream is
     about: the split is computed on what is actually payable, never scaled
     afterwards. With no leave entered this is the typed gross unchanged. */
  const base = grossAfterUnpaidLeave(wage);
  const invalid =
    grossProblem(wage.gross) !== null ||
    unpaidLeaveProblem(wage) !== null ||
    wage.age < 16 ||
    wage.age > 100 ||
    base === null;

  useEffect(() => {
    if (invalid || base === null) {
      /* Clearing it matters: leaving the last good split on screen puts the
         arithmetic for a different wage under the number now in the input, and
         the figures would read as though they described it. */
      setBreakdown(null);
      setLoading(false);
      return;
    }

    let current = true;
    setLoading(true);
    setBreakdown(null);
    setRun({ status: 'idle' });

    /* Typing a wage should not send a request per keystroke. The figures catch
       up a moment after the number settles. */
    const timer = setTimeout(() => {
      tryPreviewPayroll(
        {
          mandateId: configuration.mandateId,
          gross: base.toString(),
          age: wage.age,
          citizenship: wage.citizenship,
        },
        /* No fallback once the wage is the operator's to type: a stored split
           for a different salary under a number somebody just entered is worse
           than saying the figures could not be computed. */
        undefined,
      ).then((result) => {
        if (!current) return;
        setBreakdown(result.data);
        setSource(result.source);
        setReason(result.reason);
        setLoading(false);
      });
    }, 350);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [configuration.mandateId, wage.age, wage.citizenship, base?.toString(), invalid]);

  async function onRun() {
    if (invalid || base === null) return;

    setRun({ status: 'running' });
    const result = await tryRunPayroll({
      mandateId: configuration.mandateId,
      gross: base.toString(),
      age: wage.age,
      citizenship: wage.citizenship,
      ...(breakdown?.fxConversion
        ? {
            fxApproval: {
              myrPerUsd: breakdown.fxConversion.myrPerUsd,
              rateTimestampMs: breakdown.fxConversion.rateTimestampMs,
            },
          }
        : {}),
    });

    if (result.data === null) {
      setRun({
        status: result.uncertain ? 'unknown' : 'refused',
        message: result.reason ?? 'the run did not complete',
      });
      return;
    }
    setRun({
      status: result.data.status === 'paid' ? 'paid' : 'refused',
      digest: result.data.digest,
      message:
        result.data.abortCode !== null
          ? `The contract refused this run on abort ${result.data.abortCode}.`
          : 'The run did not go through.',
    });
  }

  const live = source === 'live';

  return (
    <div className="flex flex-col gap-5">
      {/* Only when something is actually wrong. On the healthy path a saturated
          green banner was the loudest thing on the screen and said nothing the
          reader had asked; the same provenance now rides under the button as a
          quiet line. */}
      {live ? null : (
        <DataNotice
          source={source}
          reason={reason}
          live="These figures"
          plural
          simulated={`Worked out at the official EPF, SOCSO and EIS rates. ${payrollRunNote(
            stage,
            runsAreLive,
          )}`}
          fallbackLabel="Figures unavailable."
          fallbackNote="The rates could not be read just now, so nothing below is safe to run."
        />
      )}

      <section className="flex flex-col gap-4 rounded-panel border border-rule bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-subhead">This month&rsquo;s wage</h2>
          {loading ? <span className="text-caption text-ink-3">working it out…</span> : null}
        </div>

        <WageClass value={wage} onChange={setWage} disabled={run.status === 'running'} />

        <p className="break-all font-mono text-caption text-ink-3">
          Paid to {configuration.employee}
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-panel border border-rule bg-surface p-5">
        <h2 className="text-subhead">What leaves the treasury</h2>

        {breakdown ? (
          <>
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <Breakdown breakdown={breakdown} />
            </div>
            <ClassNote breakdown={breakdown} />
          </>
        ) : (
          <p className="rounded-card border border-rule bg-canvas p-4 text-caption text-ink-3">
            {invalid
              ? 'Enter a valid monthly wage above to see the split.'
              : `The split could not be worked out${reason ? `: ${reason}` : ''}.`}
          </p>
        )}

        <div className="flex items-baseline justify-between gap-4 border-t border-rule pt-4">
          <span className="flex flex-col">
            <span className="text-body font-medium">Total cost to you</span>
            <span className="text-caption text-ink-3">The wage plus your share</span>
          </span>
          <span className="tnum text-title">
            {breakdown
              ? toDisplay(breakdown.employerCost, 6)
              : '—'}
            {breakdown ? (
              <span className="ml-2 text-caption font-normal text-ink-3">
                {breakdown.currency ?? 'MYR'}
              </span>
            ) : null}
          </span>
        </div>

        <RoleNotice access={access} />

        <button
          type="button"
          className="btn btn--accent btn--block"
          disabled={
            !access.permitted ||
            run.status === 'running' ||
            invalid ||
            breakdown === null ||
            breakdown.currency !== 'USDC' ||
            !breakdown.fxConversion
          }
          onClick={onRun}
        >
          {run.status === 'running' ? 'Running…' : 'Run payroll'}
        </button>

        {run.status === 'idle' ? (
          <p className="text-caption text-ink-3">
            {breakdown?.fxConversion
              ? 'All four payments leave together, or none of them do.'
              : 'Waiting for today’s ringgit rate before this can be run.'}
            {live ? ` ${payrollRunNote(stage, runsAreLive)}` : ''}
          </p>
        ) : null}
      </section>

      {/* The outcome gets the card the ambient banner used to occupy. What
          actually happened to somebody's wages outranks a status line. */}
      {run.status === 'paid' ? (
        <p className="rounded-card border border-ok-line bg-ok-soft p-4 text-body font-medium text-ok">
          Everyone was paid in one transaction.{' '}
          {run.digest ? (
            <a
              className="link"
              href={`https://suiscan.xyz/testnet/tx/${run.digest}`}
              target="_blank"
              rel="noreferrer"
            >
              View it
            </a>
          ) : null}
        </p>
      ) : null}

      {run.status === 'refused' ? (
        <p className="rounded-card border border-wait-line bg-wait-soft p-4 text-caption text-wait">
          <span className="font-medium">Nobody was paid.</span> {run.message}
        </p>
      ) : null}

      {run.status === 'unknown' ? (
        <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">
          <span className="font-medium">{run.message}</span> Do not run it again until you
          have checked.
        </p>
      ) : null}
    </div>
  );
}
