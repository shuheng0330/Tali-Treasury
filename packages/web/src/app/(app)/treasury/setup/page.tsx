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
        <h1 className="text-display">Create expense treasury</h1>
        <p className="text-body text-ink-2">
          This funds a reimbursement mandate on Sui from your wallet. The per-claim cap,
          the expiry and the list of addresses it may pay are fixed at creation and cannot
          be edited afterwards.
        </p>
      </header>

      <TreasurySetup />

      <p className="text-caption text-ink-3">
        Paying salaries is a separate mandate with its own statutory rules.{' '}
        <Link href="/payroll/setup" className="link">
          Set up payroll
        </Link>{' '}
        is not created here.
      </p>
    </div>
  );
}
