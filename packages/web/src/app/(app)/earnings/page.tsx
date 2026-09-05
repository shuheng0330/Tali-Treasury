import { Suspense } from 'react';
import { EarningsContent } from '@/components/earnings/EarningsContent';

export const metadata = {
  title: 'Your earnings · Tali Treasury',
};

export const dynamic = 'force-dynamic';

export default function EarningsPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Your earnings</h1>
        <p className="text-body text-ink-2">
          Your pay builds up every second you are employed. You can take what you
          have already earned whenever you need it.
        </p>
      </header>

      <Suspense fallback={<p className="text-caption text-ink-3">Loading registered payroll…</p>}><EarningsContent /></Suspense>
    </div>
  );
}
