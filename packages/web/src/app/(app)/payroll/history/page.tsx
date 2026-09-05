import Link from 'next/link';

import { Suspense } from 'react';
import { PayrollHistoryContent } from '@/components/payroll/PayrollHistoryContent';

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
export default function PayrollHistoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Past runs</h1>
        <p className="text-body text-ink-2">
          Every run is recorded before it is sent, so refusals show up here too.
        </p>
      </header>

      <Suspense fallback={<p className="text-caption text-ink-3">Loading payroll…</p>}><PayrollHistoryContent /></Suspense>

    </div>
  );
}
