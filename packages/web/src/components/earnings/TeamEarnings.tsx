'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { accruedAt, toDisplay } from '@tali/shared';

import { usePayrollConfigurations } from '@/components/payroll/PayrollSelection';
import { loadTeamEarnings, teamAccruedAt, type TeamMemberEarnings } from '@/lib/api/team-earnings';
import { useAccrualClock } from './use-accrual-clock';

const CORRECTION_INTERVAL_MS = 15_000;

function short(address: string): string {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

/**
 * The salaries this wallet pays, ticking, with nothing to press.
 *
 * The employer's half of the earnings screen. None of this money is theirs, so
 * the page carries no Withdraw button at all rather than a disabled one: a
 * greyed-out control would suggest the money is theirs on a better day, when in
 * fact the contract pays the wallet each stream names and refuses everybody
 * else. What an employer needs from this screen is whether their people are
 * actually being paid, which is a question about the chain rather than about
 * them.
 */
export function TeamEarnings() {
  const { address, configurations, status } = usePayrollConfigurations();
  const [team, setTeam] = useState<TeamMemberEarnings[] | null>(null);
  const [failed, setFailed] = useState(false);

  /* Memoised because the effects below key on it. Filtered again here rather
     than trusted from the list route, so a wallet that is an employer on one
     payroll and an employee on another never finds its own salary in the team. */
  const employed = useMemo(
    () => configurations.filter((configuration) => configuration.role === 'employer'),
    [configurations],
  );

  /* One clock for the whole list, running until the last stream has run out.
     Each row still derives its own figure from its own stream. */
  const lastEnd = (team ?? []).reduce(
    (latest, entry) => Math.max(latest, entry.stream?.endsAtMs ?? 0),
    0,
  );
  const { now } = useAccrualClock(0, lastEnd);

  const read = useCallback(async (): Promise<void> => {
    try {
      setTeam(await loadTeamEarnings(employed));
      setFailed(false);
    } catch {
      /* Keep whatever was last read on screen. A team that blanks out on one
         failed poll reads as everybody having stopped earning. */
      setFailed(true);
    }
  }, [employed]);

  useEffect(() => {
    if (status !== 'ready' || employed.length === 0) {
      setTeam(null);
      return;
    }
    void read();
    const timer = window.setInterval(() => void read(), CORRECTION_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [employed.length, read, status]);

  if (!address) {
    return (
      <Shell>
        <p className="rounded-card border border-rule p-4 text-caption">
          Connect and sign in with your Sui wallet to see what your team has earned.
        </p>
      </Shell>
    );
  }

  if (status === 'loading') {
    return (
      <Shell>
        <p className="text-caption text-ink-3">Loading registered payrolls…</p>
      </Shell>
    );
  }

  if (status === 'error') {
    return (
      <Shell>
        <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">
          Registered payrolls could not be loaded.
        </p>
      </Shell>
    );
  }

  if (employed.length === 0) {
    return (
      <Shell>
        <div className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-5">
          <p className="text-body text-ink-2">
            You have not registered a payroll yet, so nobody is accruing wages.
          </p>
          <p className="text-caption text-ink-3">
            Fund a mandate in{' '}
            <Link href="/payroll/setup" className="link">
              payroll setup
            </Link>
            , then open a salary stream against it from{' '}
            <Link href="/payroll" className="link">
              run payroll
            </Link>
            . Pay starts accruing the second that stream exists.
          </p>
        </div>
      </Shell>
    );
  }

  const live = team?.filter((entry) => entry.state === 'live').length ?? 0;
  const earned = team ? teamAccruedAt(team, (stream) => accruedAt(stream, now)) : null;

  return (
    <Shell>
      <div className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-6">
        <span className="eyebrow">Earned by your team so far</span>
        <p className="tnum text-hero leading-none" aria-live="off">
          {earned === null ? '—' : toDisplay(earned, 6)}
        </p>
        <p className="text-caption text-ink-3">
          {live} of {employed.length}{' '}
          {employed.length === 1 ? 'registered payroll is' : 'registered payrolls are'} paying
          into a live salary stream.
        </p>
      </div>

      {failed ? (
        <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">
          The team&rsquo;s salaries could not be read just now. Anything below is the last
          figure that came back, not a live one.
        </p>
      ) : null}

      {team === null && !failed ? (
        <p className="text-caption text-ink-3">Reading salary streams…</p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {(team ?? []).map((entry) => (
          <MemberRow key={entry.mandateId} member={entry} now={now} />
        ))}
      </ul>

      <p className="text-caption text-ink-3">
        These are the wages each person has earned, not wages they have been handed. Only
        the wallet a stream names can withdraw from it, and the contract refuses everybody
        else — you included.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Team earnings</h1>
        <p className="text-body text-ink-2">
          Every salary you are paying, accruing by the second. Nobody has to reach payday to
          reach what they have already earned.
        </p>
      </header>
      {children}
    </div>
  );
}

function MemberRow({ member, now }: { member: TeamMemberEarnings; now: number }) {
  const { stream } = member;
  const ended = stream !== null && now >= stream.endsAtMs;

  return (
    <li className="flex flex-col gap-4 rounded-card border border-rule bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-caption text-ink-2">{short(member.employee)}</span>
        <span className="eyebrow text-ink-3">Payroll {short(member.mandateId)}</span>
      </div>

      {stream ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="eyebrow">{ended ? 'Earned, period ended' : 'Earned so far'}</span>
            <span className="tnum text-title leading-none">
              {toDisplay(accruedAt(stream, now), 6)}
            </span>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t border-rule pt-3 text-caption">
            <div className="flex flex-col gap-0.5">
              <dt className="text-ink-3">Already withdrawn</dt>
              <dd className="tnum text-ink">{toDisplay(stream.withdrawn)} USDC</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-ink-3">This pay period</dt>
              <dd className="tnum text-ink">{toDisplay(stream.totalAmount)} USDC</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="text-caption text-ink-2">
          {member.state === 'unopened' ? (
            <>
              No salary stream has been opened against this payroll, so nothing is accruing
              for this person yet.{' '}
              <Link
                href={`/payroll?payroll=${encodeURIComponent(member.mandateId)}`}
                className="link"
              >
                Open one
              </Link>
              .
            </>
          ) : (
            <>
              A stream exists here, but its state could not be read from Sui. Nothing has
              happened to the wages; the figure is simply unknown right now.
            </>
          )}
        </p>
      )}
    </li>
  );
}
