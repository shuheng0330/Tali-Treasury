import Link from 'next/link';
import { PayrollSetup } from '@/components/payroll/PayrollSetup';

export const metadata = {
  title: 'Set up payroll · Tali Treasury',
};

/* The published package and the backend signer are read from the environment,
   so what this screen can do is not settled at build time. */
export const dynamic = 'force-dynamic';

export default function PayrollSetupPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Set up payroll</h1>
        <p className="text-body text-ink-2">
          This creates one payroll mandate on Sui and funds it from your wallet. The
          employee, the contribution floors and the spending limits are fixed at creation
          and cannot be edited afterwards.
        </p>
      </header>

      <PayrollSetup />

      <p className="text-caption text-ink-3">
        Reimbursing receipts is a separate mandate with its own rules.{' '}
        <Link href="/treasury/setup" className="link">
          Create an expense treasury
        </Link>{' '}
        instead; it is not created here.
      </p>
    </div>
  );
}
