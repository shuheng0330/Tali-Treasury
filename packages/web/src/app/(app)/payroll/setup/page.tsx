import Link from 'next/link';

import { PayrollSetup } from '@/components/payroll/PayrollSetup';

export const metadata = { title: 'Set Up Payroll · Tali Treasury' };

export default function PayrollSetupPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Employer · Sui Testnet</p>
        <h1 className="text-display">Set Up Payroll</h1>
        <p className="text-body text-ink-2">
          Create and fund a payroll mandate from your connected wallet. Expense treasuries remain a separate setup flow.
        </p>
      </header>
      <PayrollSetup />
      <Link href="/payroll" className="link self-start">Back to payroll</Link>
    </div>
  );
}
