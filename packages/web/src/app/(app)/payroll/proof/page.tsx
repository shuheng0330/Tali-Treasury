import Link from 'next/link';
import { Suspense } from 'react';
import { PayrollProofContent } from '@/components/payroll/PayrollProofContent';

export const metadata = {
  title: 'Underpaying EPF · Tali Treasury',
};

export const dynamic = 'force-dynamic';

export default function PayrollProofPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Payroll</p>
        <h1 className="text-display">Try to underpay EPF</h1>
        <p className="text-body text-ink-2">
          An employer who wants to keep the EPF money has to get it past the contract, not
          past the interface. Take the money and see.
        </p>
      </header>

      <Suspense fallback={<p className="text-caption text-ink-3">Loading payroll…</p>}><PayrollProofContent /></Suspense>

      <Link href="/payroll" className="link self-start">
        Back to payroll
      </Link>
    </div>
  );
}
