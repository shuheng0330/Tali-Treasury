import Link from 'next/link';
import { Suspense } from 'react';
import { PayrollProofContent } from '@/components/payroll/PayrollProofContent';

export const metadata = {
  title: 'Payroll Safety Test · Tali Treasury',
};

export const dynamic = 'force-dynamic';

export default function PayrollProofPage() {
  return (
    <div className="page-safe mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <p className="eyebrow text-accent-ink">Payroll Safety Test</p>
        <h1 className="text-title text-balance">Can payroll skip EPF?</h1>
        <p className="max-w-lg text-body text-ink-2">
          Set EPF below the required amount. Sui should block the entire payroll.
        </p>
      </header>

      <Suspense fallback={<p className="text-caption text-ink-3">Loading payroll…</p>}><PayrollProofContent /></Suspense>

      <Link href="/payroll" className="link self-start">
        Back to payroll
      </Link>
    </div>
  );
}
