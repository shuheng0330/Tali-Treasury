'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toDisplay } from '@tali/shared';
import { tryPreviewPayroll, tryRunPayroll } from '@/lib/api/payroll';
import { payrollAttemptNote, type PayrollStage } from '@/lib/chain-status';
import type { SampleEmployee } from '@/lib/mock/payroll';
import { RoleNotice } from '@/components/RoleNotice';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { EMPLOYER_WALLET } from '@/lib/demo-config';
import { EMPLOYER_COPY, walletAccess } from '@/lib/wallet-access';
import { Breakdown } from './Breakdown';

type Outcome =
  | { kind: 'none' }
  | { kind: 'running' }
  | { kind: 'paid'; digest: string | null }
  | { kind: 'refused'; abortCode: number | null; message: string; digest: string | null }
  | { kind: 'unavailable'; reason: string };

/**
 * The floor is on the amount, not on the presence of an address, so the honest
 * demonstration underpays EPF rather than removing it. The payment still
 * carries an EPF line; the contract still refuses it.
 */
export function EnforcementProof({
  person,
  mandateId,
  epfFloorBps,
  /* Read on the server: the package and mandate ids are not NEXT_PUBLIC_. */
  stage,
}: {
  person: SampleEmployee;
  mandateId: string;
  /** Read from the mandate when one exists. Base points, as a string. */
  epfFloorBps: string;
  stage: PayrollStage;
}) {
  const { address } = useWalletSession();
  /* Submitting from here runs a real payroll, so it is the employer's to press
     and the same gate the desk uses applies. Without it a signed-out reader met
     a dead button explained only by a missing quote — which is a consequence of
     not being signed in, not the reason. */
  const access = walletAccess(address, EMPLOYER_WALLET, EMPLOYER_COPY);

  const [scenario, setScenario] = useState<'valid' | 'underpay'>('underpay');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' });
  const [breakdown, setBreakdown] = useState(person.breakdown);

  useEffect(() => {
    let current = true;
    const sourceGross = person.breakdown.fxConversion?.source.gross ?? person.breakdown.gross;
    void tryPreviewPayroll({
      mandateId,
      gross: sourceGross,
      age: 30,
      citizenship: 'local',
    }, person.breakdown).then((result) => {
      if (current) setBreakdown(result.data ?? person.breakdown);
    });
    return () => { current = false; };
  }, [mandateId, person]);

  const epf = breakdown.bodies.find((body) => body.body === 'epf');
  const required = (BigInt(breakdown.gross) * BigInt(epfFloorBps)) / 10000n;

  async function submit() {
    setOutcome({ kind: 'running' });
    const result = await tryRunPayroll({
      mandateId,
      gross: breakdown.fxConversion?.source.gross ?? breakdown.gross,
      age: 30,
      citizenship: 'local',
      underpay: 'epf',
      ...(breakdown.fxConversion
        ? {
            fxApproval: {
              myrPerUsd: breakdown.fxConversion.myrPerUsd,
              rateTimestampMs: breakdown.fxConversion.rateTimestampMs,
            },
          }
        : {}),
    });

    if (result.data === null) {
      setOutcome({ kind: 'unavailable', reason: result.reason ?? 'the run did not complete' });
      return;
    }
    if (result.data.status === 'paid') {
      setOutcome({ kind: 'paid', digest: result.data.digest });
      return;
    }
    setOutcome({
      kind: 'refused',
      abortCode: result.data.abortCode,
      digest: result.data.digest,
      message:
        result.data.abortCode === 24
          ? `EPF must receive at least ${toDisplay(required.toString(), 6)} USDC on the quoted gross.`
          : 'The contract refused this run.',
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Payroll test scenario</legend>
        {(['valid', 'underpay'] as const).map((value) => (
          <label
            key={value}
            className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-card border p-4 transition-colors ${
              scenario === value
                ? 'border-accent bg-accent-soft'
                : 'border-rule bg-surface'
            }`}
          >
            <input
              type="radio"
              name="payroll-scenario"
              value={value}
              checked={scenario === value}
              onChange={() => {
                setScenario(value);
                setOutcome({ kind: 'none' });
              }}
              className="h-5 w-5 shrink-0 accent-accent"
            />
            <span className="font-display text-body font-medium">
              {value === 'valid' ? 'Valid Payroll' : 'Underpay EPF'}
            </span>
          </label>
        ))}
      </fieldset>

      {scenario === 'underpay' ? (
        <>
          <section className="overflow-hidden rounded-panel border border-no-line bg-no-soft">
            <div className="flex items-center gap-3 border-b border-no-line px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-no text-canvas" aria-hidden>×</span>
              <div>
                <p className="eyebrow text-no">Expected result</p>
                <h2 className="text-subhead">Blocked. No one gets paid.</h2>
              </div>
            </div>
            <dl className="grid grid-cols-1 divide-y divide-no-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-4">
                <dt className="text-caption text-ink-3">Required EPF</dt>
                <dd className="tnum mt-1 font-display text-body-lg">{toDisplay(required.toString(), 6)} USDC</dd>
              </div>
              <div className="p-4">
                <dt className="text-caption text-ink-3">Test amount</dt>
                <dd className="tnum mt-1 font-display text-body-lg">0.000001 USDC</dd>
              </div>
              <div className="p-4">
                <dt className="text-caption text-ink-3">USDC moved</dt>
                <dd className="tnum mt-1 font-display text-body-lg">0 USDC</dd>
              </div>
            </dl>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-card border border-rule bg-surface p-4">
              <p className="text-caption text-ink-3">Employee net pay</p>
              <p className="tnum mt-1 font-display text-subhead">{toDisplay(breakdown.net, 6)}</p>
              <p className="text-caption text-ink-3">USDC</p>
            </div>
            <div className="rounded-card border border-rule bg-surface p-4">
              <p className="text-caption text-ink-3">Employer cost</p>
              <p className="tnum mt-1 font-display text-subhead">{toDisplay(breakdown.employerCost, 6)}</p>
              <p className="text-caption text-ink-3">USDC</p>
            </div>
          </div>

          <details className="disclosure-card">
            <summary>View Full Payroll Calculation</summary>
            <div className="mt-4"><Breakdown breakdown={breakdown} shortedBody="epf" /></div>
          </details>

          <div className="rounded-card border border-no-line bg-no-soft p-5">
            <p className="eyebrow text-no">Expected: Blocked</p>
            <p className="mt-2 text-body text-ink-2">
              EPF is below the required minimum, so the entire transaction should fail.
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-card border border-ok-line bg-ok-soft p-5">
          <p className="eyebrow text-ok">Comparison only</p>
          <h2 className="mt-2 text-subhead">Valid payroll belongs on the payroll page.</h2>
          <p className="mt-1 text-caption text-ink-2">This safety screen cannot start a valid payment.</p>
          <Link href="/payroll" className="btn btn--ghost mt-4 w-full sm:w-fit">Go to Payroll</Link>
        </div>
      )}

      <RoleNotice access={access} />

      {scenario === 'underpay' ? (
        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          disabled={!access.permitted || outcome.kind === 'running' || !breakdown.fxConversion}
          onClick={submit}
        >
          {outcome.kind === 'running' ? 'Running Safety Test…' : 'Run Safety Test'}
        </button>
      ) : null}

      {access.permitted && !breakdown.fxConversion ? (
        <p className="text-caption text-wait">
          A live MYR-to-USDC quote is required before this Testnet transaction can be submitted.
        </p>
      ) : null}

      <div aria-live="polite">
      {outcome.kind === 'refused' ? (
        <section className="rounded-panel border border-ok-line bg-ok-soft p-5">
          <p className="eyebrow text-ok">Safety test passed</p>
          <h2 className="mt-2 text-heading">Blocked as Expected</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div><dt className="text-caption text-ink-3">Contract result</dt><dd className="tnum text-body font-medium">Abort {outcome.abortCode ?? '—'}</dd></div>
            <div><dt className="text-caption text-ink-3">Funds moved</dt><dd className="tnum text-body font-medium">0 USDC moved</dd></div>
          </dl>
          {outcome.digest ? (
            <a className="link mt-4 inline-flex min-h-11 items-center" href={`https://suiscan.xyz/testnet/tx/${outcome.digest}`} target="_blank" rel="noreferrer">
              View Failed Transaction
            </a>
          ) : null}
        </section>
      ) : null}

      {outcome.kind === 'paid' ? (
        <p className="rounded-card border border-ok-line bg-ok-soft p-4 text-caption text-ok">
          <span className="font-medium">Paid in one transaction.</span>{' '}
          {outcome.digest ? (
            <a
              className="link"
              href={`https://suiscan.xyz/testnet/tx/${outcome.digest}`}
              target="_blank"
              rel="noreferrer"
            >
              View it on Suiscan
            </a>
          ) : null}
        </p>
      ) : null}

      {outcome.kind === 'unavailable' ? (
        <p className="rounded-card border border-wait-line bg-wait-soft p-4 text-caption text-wait">
          <span className="font-medium">Nothing was submitted.</span>{' '}
          {payrollAttemptNote(stage)} — {outcome.reason}.
        </p>
      ) : null}
      </div>

      <details className="disclosure-card">
        <summary>How This Test Works</summary>
        <p className="mt-3 text-caption text-ink-2">
          Tali sends one atomic Testnet payroll with EPF set below the mandate minimum.
          Sui should reject it before any recipient is paid.
        </p>
      </details>
    </div>
  );
}
