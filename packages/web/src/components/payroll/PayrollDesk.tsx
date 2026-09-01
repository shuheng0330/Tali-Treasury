'use client';

import { useEffect, useState } from 'react';
import type { PayrollBreakdown } from '@tali/shared';
import { toDisplay } from '@tali/shared';
import { tryPreviewPayroll, tryRunPayroll } from '@/lib/api/payroll';
import type { Source } from '@/lib/api/demo';
import type { SampleEmployee } from '@/lib/mock/payroll';
import { DataNotice } from '@/components/DataNotice';
import { Breakdown } from './Breakdown';

interface RunState {
  status: 'idle' | 'running' | 'paid' | 'refused' | 'unknown';
  digest?: string | null;
  message?: string;
}

export function PayrollDesk({
  staff,
  runsAreLive,
}: {
  staff: SampleEmployee[];
  runsAreLive: boolean;
}) {
  const [selected, setSelected] = useState(staff[0]);
  const [breakdown, setBreakdown] = useState<PayrollBreakdown>(staff[0].breakdown);
  const [source, setSource] = useState<Source>('mock');
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<RunState>({ status: 'idle' });

  useEffect(() => {
    let current = true;
    setLoading(true);
    setRun({ status: 'idle' });

    tryPreviewPayroll(
      {
        employee: selected.address,
        gross: selected.breakdown.gross,
        age: 30,
        citizenship: 'local',
      },
      selected.breakdown,
    ).then((result) => {
      if (!current) return;
      setBreakdown(result.data);
      setSource(result.source);
      setReason(result.reason);
      setLoading(false);
    });

    return () => {
      current = false;
    };
  }, [selected]);

  const monthlyCost = staff.reduce(
    (sum, person) => sum + BigInt(person.breakdown.employerCost),
    0n,
  );

  async function onRun() {
    setRun({ status: 'running' });
    const result = await tryRunPayroll({
      employee: selected.address,
      gross: selected.breakdown.gross,
      age: 30,
      citizenship: 'local',
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
        simulated={`Figures follow the EPF Third Schedule bands and the RM6,000 SOCSO and EIS ceilings. ${
          runsAreLive
            ? 'Running payroll signs a real transaction on Sui testnet.'
            : 'Paying a run still needs the payroll module on chain.'
        }`}
      />

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
        <span className="eyebrow">
          {selected.name}&rsquo;s payroll run{loading ? ' · reading' : ''}
        </span>
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Breakdown breakdown={breakdown} />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-body text-ink-2">This month, all staff</span>
          <span className="tnum text-title">{toDisplay(monthlyCost.toString())}</span>
        </div>

        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={run.status === 'running'}
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
            The wage and all three statutory payments leave together, or not at all.
          </p>
        ) : null}
      </div>
    </div>
  );
}
