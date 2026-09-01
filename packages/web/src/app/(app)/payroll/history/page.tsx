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

export default async function PayrollHistoryPage() {
  const runs = await getPayrollService().listRecent(20);
  const { persisted, reason } = payrollRunsArePersisted();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Payroll</p>
        <h1 className="text-display">What has been run</h1>
        <p className="text-body text-ink-2">
          Every run is written down before it is signed, so a refusal leaves the same
          trail as a payment.
        </p>
      </header>

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

      <Link href="/payroll" className="link self-start">
        Back to payroll
      </Link>
    </div>
  );
}
