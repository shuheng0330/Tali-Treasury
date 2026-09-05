'use client';

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
  | { kind: 'refused'; abortCode: number | null; message: string }
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

  const [shortEpf, setShortEpf] = useState(false);
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
      underpay: shortEpf ? 'epf' : undefined,
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
      message:
        result.data.abortCode === 24
          ? `EPF must receive at least ${toDisplay(required.toString(), 6)} USDC on the quoted gross.`
          : 'The contract refused this run.',
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={shortEpf}
            onChange={(event) => {
              setShortEpf(event.target.checked);
              setOutcome({ kind: 'none' });
            }}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
          />
          <span className="flex flex-col gap-1">
            <span className="text-body font-medium">Underpay EPF</span>
            <span className="text-caption text-ink-2">
              Send one base unit to EPF instead of {toDisplay(epf?.total ?? '0')}, and keep
              the difference. Everything else about the run stays correct.
            </span>
          </span>
        </label>
      </div>

      <Breakdown breakdown={breakdown} shortedBody={shortEpf ? 'epf' : null} />

      {shortEpf ? (
        <div className="flex flex-col gap-2 rounded-card border border-stop-line bg-stop-soft p-5">
          <span className="eyebrow text-stop">What the contract will do</span>
          <p className="text-body text-ink-2">
            <span className="font-medium text-stop">Refuse it, on abort 24.</span> EPF must
            receive at least {toDisplay(required.toString(), 6)} USDC on a gross of{' '}
            {toDisplay(breakdown.gross, 6)} USDC. Nothing moves: the worker is not paid
            either, because the payment is one transaction and it reverts whole.
          </p>
          <p className="text-caption text-ink-3">
            The address is still in the payment. Presence was never the check.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-card border border-ok-line bg-ok-soft p-5">
          <span className="eyebrow text-ok">What the contract will do</span>
          <p className="text-body text-ink-2">
            Pay four recipients in one transaction, totalling{' '}
            {toDisplay(breakdown.employerCost, 6)} USDC. The worker cannot be paid without
            EPF, SOCSO and EIS being paid in the same moment.
          </p>
        </div>
      )}

      <RoleNotice access={access} />

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={!access.permitted || outcome.kind === 'running' || !breakdown.fxConversion}
        onClick={submit}
      >
        {outcome.kind === 'running'
          ? 'Submitting…'
          : shortEpf
            ? 'Submit the underpaid run'
            : 'Run payroll'}
      </button>

      {access.permitted && !breakdown.fxConversion ? (
        <p className="text-caption text-wait">
          A live MYR-to-USDC quote is required before this Testnet transaction can be submitted.
        </p>
      ) : null}

      {outcome.kind === 'refused' ? (
        <p className="rounded-card border border-stop-line bg-stop-soft p-4 text-caption text-stop">
          <span className="font-medium">
            Refused on abort {outcome.abortCode ?? 24}.
          </span>{' '}
          {outcome.message} No balance changed.
        </p>
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
  );
}
