'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LeaveKind, LeaveRequest } from '@tali/shared';
import { LEAVE_KIND_LABEL, toDisplay, unpaidLeaveDeduction } from '@tali/shared';

import { tryListLeave, trySubmitLeave, type LeaveListing } from '@/lib/api/leave';
import {
  blockingLeaveIssue,
  checkLeaveRequest,
  leaveWageOfRecord,
  ownLeave,
  parseDays,
  spanInDays,
  workingDaysBetween,
} from '@/lib/leave-form';
import { DEMO_MONTHLY_WAGE, isoDay } from '@/lib/overtime-form';
import { signedInAccess, type AccessCopy } from '@/lib/wallet-access';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { DataNotice } from '@/components/DataNotice';
import { Select } from '@/components/Select';
import { RoleNotice } from '@/components/RoleNotice';
import { LeaveList } from './LeaveList';

const LEAVE_COPY: AccessCopy = {
  action: 'ask for leave',
  holder: 'your wallet',
};

const KINDS: readonly LeaveKind[] = ['annual', 'sick', 'unpaid'];

const EMPTY_LISTING: LeaveListing = {
  data: [],
  source: 'live',
  reason: null,
  reached: true,
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 rounded-control border border-rule bg-surface px-3 py-2">
      <span className="text-body font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="text-caption text-ink-3">{hint}</span> : null}
    </label>
  );
}

/**
 * The employee's whole leave screen.
 *
 * It holds the list as well as the form for the reason the overtime screen
 * does: the overlap check is made against it, and a second fetch would let the
 * warning disagree with the list printed under it.
 */
export function LeaveRequestForm() {
  const wallet = useWalletSession();
  const access = signedInAccess(wallet.address, LEAVE_COPY);

  const [listing, setListing] = useState<LeaveListing>(EMPTY_LISTING);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  const [startOn, setStartOn] = useState('');
  const [endOn, setEndOn] = useState('');
  const [kind, setKind] = useState<LeaveKind>('annual');
  /** Null while the count still follows the dates, set once the employee corrects it. */
  const [chosenDays, setChosenDays] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState<LeaveRequest | null>(null);

  useEffect(() => {
    const day = isoDay(new Date());
    setStartOn((current) => current || day);
    setEndOn((current) => current || day);
  }, []);

  const address = wallet.address;

  useEffect(() => {
    if (!address) {
      setListing(EMPTY_LISTING);
      setLoading(false);
      return;
    }

    let current = true;
    setLoading(true);
    tryListLeave().then((result) => {
      if (!current) return;
      setListing(result);
      setLoading(false);
    });

    return () => {
      current = false;
    };
  }, [address, reload]);

  /* Always the signed-in wallet's own, for the reason the overtime screen
     filters: the server hands an employer everybody's requests to build the
     approval queue from, and this screen is their own leave. */
  const mine = ownLeave(listing.data, address);

  const monthlyWage = leaveWageOfRecord(mine) ?? DEMO_MONTHLY_WAGE;
  const counted = workingDaysBetween(startOn, endOn);
  const days = chosenDays ?? counted ?? '';
  const span = spanInDays(startOn, endOn);
  const centidays = parseDays(days);

  const issues = useMemo(() => {
    if (!startOn || !endOn || centidays === null) return [];
    return checkLeaveRequest({ startOn, endOn, days, existing: mine });
  }, [startOn, endOn, days, centidays, mine]);

  const blocked = blockingLeaveIssue(issues);
  const deduction =
    kind === 'unpaid' && centidays !== null && centidays > 0n
      ? unpaidLeaveDeduction(monthlyWage, days)
      : '0';

  const missing = !startOn
    ? 'the first day of leave'
    : !endOn
      ? 'the last day of leave'
      : days.trim() === ''
        ? 'the number of days taken'
        : centidays === null
          ? 'the days as a number, to at most two decimals'
          : reason.trim() === ''
            ? 'a short reason'
            : null;
  const ready = access.permitted && missing === null && blocked === null && !submitting;

  async function onSubmit() {
    if (!ready) return;

    setSubmitting(true);
    setSubmitError(null);
    const result = await trySubmitLeave({
      startOn,
      endOn,
      days,
      kind,
      reason: reason.trim(),
    });
    setSubmitting(false);

    if (result.data === null) {
      setSubmitError(`This request was not sent: ${result.reason}.`);
      return;
    }

    setSent(result.data);
    setReason('');
    setChosenDays(null);
    setReload((count) => count + 1);
  }

  if (wallet.status === 'loading') {
    return <p className="text-caption text-ink-3">Checking your wallet session…</p>;
  }

  if (!address) {
    return (
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-panel border border-rule bg-surface p-5">
          <h2 className="eyebrow">Whose screen this is</h2>
          <p className="text-body-lg">
            The employee&rsquo;s. Ask for time off and the employer approves or refuses it.
          </p>
          <p className="text-body text-ink-2">
            Annual and sick leave are ordinary wages and change nothing about what payroll
            pays. Only unpaid leave reduces the wage, and it reduces the base every one of
            the three statutory bodies counts.
          </p>
        </section>
        <RoleNotice access={access} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {loading ? null : (
        <DataNotice
          source={listing.source}
          reason={listing.reason}
          live="Your leave requests"
          plural
          simulated="Approval is the employer's."
          fallbackLabel={listing.reached ? 'Held in memory.' : 'Nothing loaded.'}
          brief={{
            live: 'Your requests are live.',
            fallback: 'Live requests are unavailable — saved temporarily. Employer approval is still required.',
          }}
        />
      )}

      <RoleNotice access={access} />

      {submitError ? (
        <p
          role="alert"
          className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no"
        >
          {submitError}
        </p>
      ) : null}

      {sent ? (
        <p
          className="rounded-card border border-ok-line bg-ok-soft p-4 text-caption text-ok"
          aria-live="polite"
        >
          <span className="font-medium">Sent to the employer.</span>{' '}
          <span className="text-ink-2">
            {BigInt(sent.deduction) > 0n ? (
              <>
                Approving it takes <span className="tnum">{toDisplay(sent.deduction)}</span> MYR
                off the next payroll run.
              </>
            ) : (
              'Approving it changes nothing about what payroll pays.'
            )}
          </span>
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First day">
            <input
              type="date"
              value={startOn}
              disabled={!access.permitted}
              onChange={(event) => {
                setStartOn(event.target.value);
                if (endOn && event.target.value > endOn) setEndOn(event.target.value);
                setChosenDays(null);
                setSent(null);
              }}
              className="tnum bg-transparent text-body outline-none disabled:opacity-60"
            />
          </Field>

          <Field label="Last day">
            <input
              type="date"
              value={endOn}
              min={startOn || undefined}
              disabled={!access.permitted}
              onChange={(event) => {
                setEndOn(event.target.value);
                setChosenDays(null);
                setSent(null);
              }}
              className="tnum bg-transparent text-body outline-none disabled:opacity-60"
            />
          </Field>
        </div>

        <Select
          label="Kind of leave"
          value={kind}
          disabled={!access.permitted}
          onChange={(next) => {
            setKind(next);
            setSent(null);
          }}
          options={KINDS.map((option) => ({
            value: option,
            label: LEAVE_KIND_LABEL[option],
            note: option === 'unpaid' ? 'reduces the wage' : undefined,
          }))}
          hint={
            kind === 'unpaid'
              ? 'Reduces next payroll and statutory bases.'
              : 'Paid leave — no payroll change.'
          }
        />

        <Field
          label="Days taken"
          hint={
            chosenDays === null
              ? span !== null && span >= 1
                ? `Counted from the dates. ${span} calendar ${
                    span === 1 ? 'day' : 'days'
                  }, excluding Sundays. Adjust for public holidays.`
                : 'Set both dates to calculate days.'
              : 'Your correction must stay within the selected dates.'
          }
        >
          <span className="flex items-baseline gap-2">
            <input
              value={days}
              inputMode="decimal"
              placeholder="0"
              disabled={!access.permitted}
              onChange={(event) => {
                setChosenDays(event.target.value);
                setSent(null);
              }}
              className="tnum w-full bg-transparent text-title outline-none placeholder:text-ink-3 disabled:opacity-60"
            />
            <span className="text-body text-ink-3">days</span>
          </span>
        </Field>

        <Field label="Reason">
          <input
            value={reason}
            disabled={!access.permitted}
            placeholder="Family matters back home"
            onChange={(event) => setReason(event.target.value)}
            className="bg-transparent text-body outline-none placeholder:text-ink-3 disabled:opacity-60"
          />
        </Field>

        {issues.map((issue) => (
          <p
            key={issue.code}
            role={issue.blocking ? 'alert' : undefined}
            className={`rounded-control border p-3 text-caption ${
              issue.blocking
                ? 'border-no-line bg-no-soft text-no'
                : 'border-wait-line bg-wait-soft text-wait'
            }`}
          >
            {issue.message}
          </p>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-panel border border-rule bg-surface p-5">
        <h2 className="eyebrow">Payroll impact</h2>
        {kind === 'unpaid' ? (
          <>
            <p className="text-caption text-ink-2">Deducted from next payroll</p>
            <p className="flex items-baseline gap-2">
              <span className="tnum text-display">{toDisplay(deduction)}</span>
              <span className="text-body text-ink-3">MYR</span>
            </p>
            <p className="text-caption text-ink-3">Also reduces EPF, SOCSO and EIS wage bases.</p>
            <details className="border-t border-rule pt-3">
              <summary className="cursor-pointer text-caption font-medium text-ink underline underline-offset-4">
                View calculation details
              </summary>
              <p className="mt-3 text-caption text-ink-2">
                Monthly wage of <span className="tnum">{toDisplay(monthlyWage)}</span> MYR ÷ 26
                working days. Unpaid leave lowers the wage base used by EPF, SOCSO and EIS.
              </p>
            </details>
          </>
        ) : (
          <>
            <p className="text-body-lg font-medium">No payroll change</p>
            <p className="text-caption text-ink-3">{LEAVE_KIND_LABEL[kind]} is paid leave.</p>
          </>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!ready}
          onClick={() => void onSubmit()}
          className="btn btn--primary btn--block btn--lg"
        >
          {submitting ? 'Sending…' : 'Send to the employer'}
        </button>

        {missing && access.permitted ? (
          <p className="text-center text-caption text-ink-3">Still needs {missing}.</p>
        ) : null}
      </div>

      <LeaveList requests={mine} loading={loading} />
    </div>
  );
}
