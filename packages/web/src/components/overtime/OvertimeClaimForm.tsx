'use client';

import { useEffect, useMemo, useState } from 'react';
import type { OvertimeClaim, OvertimeKind } from '@tali/shared';
import {
  OVERTIME_KIND_LABEL,
  OVERTIME_KIND_RATE,
  checkOvertimeClaim,
  toDisplay,
} from '@tali/shared';

import {
  tryListOvertime,
  trySubmitOvertime,
  type OvertimeDraft,
  type OvertimeListing,
} from '@/lib/api/overtime';
import {
  DEMO_MONTHLY_WAGE,
  blockingIssue,
  claimedDates,
  defaultOvertimeKind,
  isoDay,
  monthHoursClaimed,
  monthOf,
  ownClaims,
  parseHours,
  wageOfRecord,
} from '@/lib/overtime-form';
import { signedInAccess, type AccessCopy } from '@/lib/wallet-access';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { DataNotice } from '@/components/DataNotice';
import { Select } from '@/components/Select';
import { RoleNotice } from '@/components/RoleNotice';
import { OvertimeList } from './OvertimeList';
import { OvertimePreview } from './OvertimePreview';
import { TimesheetCapture } from './TimesheetCapture';

const OVERTIME_COPY: AccessCopy = {
  action: 'claim overtime',
  holder: 'your wallet',
};

const KINDS: readonly OvertimeKind[] = ['normal_day', 'rest_day', 'public_holiday'];

const EMPTY_LISTING: OvertimeListing = {
  data: [],
  source: 'live',
  reason: null,
  reached: true,
};

function Field({
  label,
  hint,
  uncertain = false,
  children,
}: {
  label: string;
  hint?: string;
  /** Read from a photographed timesheet and worth a second look. */
  uncertain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 rounded-control px-3 py-2 ${
        uncertain ? 'border border-wait-line bg-wait-soft' : 'border border-rule bg-surface'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="text-body font-medium text-ink-2">{label}</span>
        {uncertain ? <span className="text-caption text-wait">not sure</span> : null}
      </span>
      {children}
      {hint ? <span className="text-caption text-ink-3">{hint}</span> : null}
    </label>
  );
}

/**
 * The employee's whole overtime screen.
 *
 * It holds the claim list as well as the form because the form's checks are
 * made against it: the hours already claimed this month and the days already
 * spoken for come out of the same fetch, and a second fetch would let the
 * warnings disagree with the list printed under them.
 */
export function OvertimeClaimForm() {
  const wallet = useWalletSession();
  const access = signedInAccess(wallet.address, OVERTIME_COPY);

  const [listing, setListing] = useState<OvertimeListing>(EMPTY_LISTING);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  const [today, setToday] = useState('');
  const [workedOn, setWorkedOn] = useState('');
  /** Null while the day type still follows the date, set once the employee corrects it. */
  const [chosenKind, setChosenKind] = useState<OvertimeKind | null>(null);
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');
  const [uncertain, setUncertain] = useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState<OvertimeClaim | null>(null);

  useEffect(() => {
    const day = isoDay(new Date());
    setToday(day);
    setWorkedOn((current) => current || day);
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
    tryListOvertime().then((result) => {
      if (!current) return;
      setListing(result);
      setLoading(false);
    });

    return () => {
      current = false;
    };
  }, [address, reload]);

  /* Always the signed-in wallet's own. The server hands an employer every
     employee's claims so the approval queue can be built from the same call,
     and this screen is the employer's own overtime, not everyone's. */
  const mine = ownClaims(listing.data, address);

  const recordedWage = wageOfRecord(mine);
  const monthlyWage = recordedWage ?? DEMO_MONTHLY_WAGE;
  const kind = chosenKind ?? defaultOvertimeKind(workedOn);
  const month = monthOf(workedOn || today);
  const centihours = parseHours(hours);

  const issues = useMemo(() => {
    if (!today || !workedOn || centihours === null || centihours <= 0n) return [];
    return checkOvertimeClaim({
      workedOn,
      hours,
      todayIso: today,
      monthHoursClaimed: monthHoursClaimed(mine, month),
      claimedDates: claimedDates(mine, month),
      /* The approved-leave warning wants the leave register, which is the leave
         screen's to read and not this one's. */
      leaveDates: [],
    });
  }, [today, workedOn, hours, centihours, mine, month]);

  const blocked = blockingIssue(issues);
  const missing = !workedOn
    ? 'the day you worked'
    : hours.trim() === ''
      ? 'the hours you worked past the normal day'
      : centihours === null
        ? 'the hours as a number, to at most two decimals'
        : centihours <= 0n
          ? 'more than nothing in the hours'
          : reason.trim() === ''
            ? 'a short reason'
            : null;
  const ready = access.permitted && missing === null && blocked === null && !submitting;

  function applyDraft(draft: OvertimeDraft) {
    if (draft.workedOn) setWorkedOn(draft.workedOn);
    if (draft.kind) setChosenKind(draft.kind);
    if (draft.hours) setHours(draft.hours);
    setUncertain(new Set(draft.uncertain));
    setSent(null);
  }

  async function onSubmit() {
    if (!ready) return;

    setSubmitting(true);
    setSubmitError(null);
    const result = await trySubmitOvertime({ workedOn, kind, hours, reason: reason.trim() });
    setSubmitting(false);

    if (result.data === null) {
      setSubmitError(`This claim was not sent: ${result.reason}.`);
      return;
    }

    setSent(result.data);
    setHours('');
    setReason('');
    setChosenKind(null);
    setUncertain(new Set());
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
            The employee&rsquo;s. Record a day you worked past normal hours; the employer
            approves or refuses it, and approved overtime is added to the wage in the next
            payroll run.
          </p>
          <p className="text-body text-ink-2">
            The multiplier is not a setting. The Employment Act fixes it at 1.5&times; on a
            working day, 2&times; on a rest day and 3&times; on a public holiday, all on the
            hourly rate your monthly wage implies.
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
          live="Your overtime claims"
          plural
          simulated="Approval is the employer's, and payment waits for the next payroll run."
          fallbackLabel={listing.reached ? 'Held in memory.' : 'Nothing loaded.'}
          brief={{
            live: 'Your requests are live.',
            fallback: 'Live requests are unavailable — saved temporarily. Employer approval is still required.',
          }}
        />
      )}

      <RoleNotice access={access} />

      {submitError ? (
        <p role="alert" className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">
          {submitError}
        </p>
      ) : null}

      {sent ? (
        <p className="rounded-card border border-ok-line bg-ok-soft p-4 text-caption text-ok" aria-live="polite">
          <span className="font-medium">Sent to the employer.</span>{' '}
          <span className="text-ink-2">
            <span className="tnum">{toDisplay(sent.pay)}</span> MYR joins the next payroll run
            if they approve it.
          </span>
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <TimesheetCapture disabled={!access.permitted} onDraft={applyDraft} />

        <Field label="Day worked" uncertain={uncertain.has('workedOn')}>
          <input
            type="date"
            value={workedOn}
            max={today || undefined}
            disabled={!access.permitted}
            onChange={(event) => {
              setWorkedOn(event.target.value);
              setSent(null);
            }}
            className="tnum bg-transparent text-body outline-none disabled:opacity-60"
          />
        </Field>

        <Select
          label="Day type"
          uncertain={uncertain.has('kind')}
          value={kind}
          disabled={!access.permitted}
          onChange={(next) => setChosenKind(next)}
          options={KINDS.map((option) => ({
            value: option,
            label: OVERTIME_KIND_LABEL[option],
            note: OVERTIME_KIND_RATE[option],
          }))}
          hint={
            chosenKind === null
              ? 'Check rest day or public holiday.'
              : 'Your correction. The statutory multiplier still applies.'
          }
        />

        <Field
          label="Overtime hours"
          uncertain={uncertain.has('hours')}
          hint="Hours after your 8-hour day."
        >
          <span className="flex items-baseline gap-2">
            <input
              value={hours}
              inputMode="decimal"
              placeholder="0"
              disabled={!access.permitted}
              onChange={(event) => {
                setHours(event.target.value);
                setSent(null);
              }}
              className="tnum w-full bg-transparent text-title outline-none placeholder:text-ink-3 disabled:opacity-60"
            />
            <span className="text-body text-ink-3">hours</span>
          </span>
        </Field>

        <Field label="Work summary">
          <input
            value={reason}
            disabled={!access.permitted}
            placeholder="Closing the month-end books"
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

      <OvertimePreview
        monthlyWage={monthlyWage}
        wageIsOnRecord={recordedWage !== null}
        kind={kind}
        hours={hours}
      />

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

      <OvertimeList claims={mine} loading={loading} month={month} />
    </div>
  );
}
