import Link from 'next/link';
import { PayrollPageContent } from '@/components/payroll/PayrollPageContent';
import { Suspense } from 'react';
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
        <h1 className="text-display">Run payroll</h1>
        <p className="text-body text-ink-2">
          The wage, EPF, SOCSO and EIS leave together. If one is short, none of them moves.
        </p>
      </header>

      <Suspense fallback={<p className="text-caption text-ink-3">Loading payroll…</p>}>
        <PayrollPageContent runsAreLive={payrollIsLive()} />
      </Suspense>

      <Link href="/safety/payroll" className="btn btn--ghost btn--block">
        Try underpaying EPF
      </Link>
    </div>
  );
}
