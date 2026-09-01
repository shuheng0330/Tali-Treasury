import Link from 'next/link';
import { PayrollDesk } from '@/components/payroll/PayrollDesk';
import { sampleStaff } from '@/lib/mock/payroll';

export const metadata = {
  title: 'Payroll · Tali Treasury',
};

export default function PayrollPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Payroll</h1>
        <p className="text-body text-ink-2">
          A wage and its statutory contributions leave the treasury as one transaction. If
          any of them is short, none of them moves.
        </p>
      </header>

      <PayrollDesk staff={sampleStaff} />

      <Link href="/payroll/proof" className="btn btn--ghost btn--block">
        Try underpaying EPF
      </Link>
    </div>
  );
}
