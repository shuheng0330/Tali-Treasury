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

  return (
    <div className="flex flex-col gap-6">
      <DataNotice
        source={source}
        reason={reason}
        live="The statutory split"
        simulated={`Figures follow the EPF Third Schedule bands and the RM6,000 SOCSO and EIS ceilings. ${payrollRunNote(
          stage,
          runsAreLive,
        )}`}
      />

      <div className="flex flex-col gap-3">
        <span className="eyebrow">Staff on this mandate</span>

        <div className="rounded-control border border-ink bg-raised px-4 py-3">
          <span className="text-body font-medium">Registered employee</span>
          <p className="truncate font-mono text-caption text-ink-3">{configuration.employee}</p>
        </div>

        <p className="text-caption text-ink-3">
          The mandate&rsquo;s floors are fixed on chain for one class of worker, so a
          class it was not created for can be refused by the contract even when the
          arithmetic below is right.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="eyebrow">
          Employee payroll run{loading ? ' · reading' : ''}
        </span>

        <WageClass value={wage} onChange={setWage} disabled={run.status === 'running'} />

        {breakdown ? (
          <>
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <Breakdown breakdown={breakdown} />
            </div>
            <ClassNote breakdown={breakdown} />
          </>
        ) : (
          <p className="rounded-card border border-dashed border-rule bg-surface p-4 text-caption text-ink-3">
            {invalid
              ? 'No split is shown while the figures above cannot be read as a monthly wage.'
              : `The statutory split could not be computed${reason ? `: ${reason}` : ''}.`}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="flex flex-col">
            <span className="text-body text-ink-2">This run costs the employer</span>
            <span className="text-caption text-ink-3">
              One employee registered on this mandate
            </span>
          </span>
          <span className="tnum text-title">
            {breakdown ? `${toDisplay(breakdown.employerCost, 6)} ${breakdown.currency ?? 'MYR'}` : '—'}
          </span>
        </div>

        <RoleNotice access={access} />

        <button
          type="button"
          className="btn btn--primary btn--block"
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

        {run.status === 'paid' ? (
          <p className="text-caption text-ok">
            Paid in one transaction.{' '}
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
          <p className="text-caption text-wait">
            Nothing was paid: {run.message}
          </p>
        ) : null}

        {run.status === 'unknown' ? (
          <p className="text-caption text-no">
            {run.message} Do not run it again until you have checked.
          </p>
        ) : null}

        {run.status === 'idle' ? (
          <p className="text-caption text-ink-3">
            {breakdown?.fxConversion
              ? 'Approve the displayed MYR-to-USDC quote. The wage and all three statutory payments then leave together, or not at all.'
              : 'A live MYR-to-USDC quote is required before payroll can be submitted.'}
          </p>
        ) : null}
      </div>
    </div>
  );
}
