import Link from 'next/link';

import { DataNotice } from '@/components/DataNotice';
import { RunHistory } from '@/components/payroll/RunHistory';
import {
  getPayrollService,
  payrollRunsArePersisted,
} from '@/server/payroll/dependencies';

export const metadata = {
  title: 'Payroll history · Tali Treasury',
};

export const dynamic = 'force-dynamic';

/**
 * A database that is merely unreachable throws rather than falling back —
 * `fallbackStore` only substitutes memory for a table that does not exist yet,
 * which is right for a write. For this read it used to take the whole screen
 * down with it, so the failure is caught here instead.
 */
async function readRuns() {
  try {
    const runs = await getPayrollService().listRecent(20);
    const { persisted, reason } = payrollRunsArePersisted();
    return { runs, persisted, reason, unreadable: false };
  } catch {
    return { runs: [], persisted: false, reason: null, unreadable: true };
  }
}

export default async function PayrollHistoryPage() {
  const { runs, persisted, reason, unreadable } = await readRuns();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Payroll</p>
        <h1 className="text-display">What has been run</h1>
        <p className="text-body text-ink-2">
          A run that reaches the contract is written down before it is signed, so a
          refusal leaves the same trail as a payment.
        </p>
      </header>

      {unreadable ? (
        <>
          <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">
            <span className="font-medium">The run history could not be read.</span>{' '}
            The database did not answer, so this page cannot say what has been run.
            An empty list here would claim nothing was, which may not be true.
          </p>
          <p className="rounded-card border border-dashed border-rule bg-surface p-5 text-body text-ink-3">
            Start the database and reload. Nothing was written, retried or paid as a
            result of this failure.
          </p>
        </>
      ) : (
        <>
          <DataNotice
            source={persisted ? 'live' : 'mock'}
            reason={reason}
            live="These runs"
            simulated={
              persisted
                ? 'They are stored in the database and survive a restart.'
                : 'They are real attempts, kept only while this server is up.'
            }
            plural
            fallbackLabel="Held in memory."
          />

          <RunHistory runs={runs} />
        </>
      )}

      <Link href="/payroll" className="link self-start">
        Back to payroll
      </Link>
    </div>
  );
}
