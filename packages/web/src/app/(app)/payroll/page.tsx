import Link from 'next/link';
import { PayrollDesk } from '@/components/payroll/PayrollDesk';
import { sampleStaff } from '@/lib/mock/payroll';
import { payrollIsLive } from '@/server/payroll/dependencies';

export const metadata = {
  title: 'Payroll · Tali Treasury',
};

/* Whether a run can be signed is read from the environment, so this cannot be
   settled at build time and baked into a static page. */
export const dynamic = 'force-dynamic';

export default function PayrollPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Payroll</h1>
        <p className="text-body text-ink-2">
          A wage and its statutory contributions leave the treasury as one transaction. If
          any of them is short, none of them moves.
        </p>
      </header>

      <PayrollDesk staff={sampleStaff} runsAreLive={payrollIsLive()} />

      <div className="flex flex-col gap-3">
        <Link href="/payroll/proof" className="btn btn--ghost btn--block">
          Try underpaying EPF
        </Link>
        <Link href="/payroll/history" className="link self-start">
          What has been run
        </Link>
        <Link href="/payroll/setup" className="link self-start">
          Set up a payroll mandate
        </Link>
      </div>
    </div>
  );
}
