import Link from 'next/link';
import { TreasurySetup } from '@/components/treasury/TreasurySetup';

export const metadata = {
  title: 'Create expense treasury · Tali Treasury',
};

/* The configured backend signer is read from the environment, so what this
   screen offers is not settled at build time. */
export const dynamic = 'force-dynamic';

export default function TreasurySetupPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Set up an expense budget</h1>
        <p className="text-body text-ink-2">
          Put money aside to pay staff back for receipts. Once created, the limit and the
          people it can pay cannot be changed.
        </p>
      </header>

      <TreasurySetup />

      <p className="text-caption text-ink-3">
        Paying salaries is separate.{' '}
        <Link href="/payroll/setup" className="link">
          Set up payroll
        </Link>{' '}
        for that.
      </p>
    </div>
  );
}
