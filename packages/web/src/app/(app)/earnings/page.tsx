import { Suspense } from 'react';
import { EarningsContent } from '@/components/earnings/EarningsContent';

/* Neutral on purpose. This route is the employee's own salary and the
   employer's view of every salary they pay, and a tab reading "Your earnings"
   over the second one would name the wrong thing. */
export const metadata = {
  title: 'Earnings · Tali Treasury',
};

export const dynamic = 'force-dynamic';

export default function EarningsPage() {
  return (
    <Suspense
      fallback={
        <p className="mx-auto w-full max-w-md px-5 py-6 text-caption text-ink-3">
          Loading registered payroll…
        </p>
      }
    >
      <EarningsContent />
    </Suspense>
  );
}
