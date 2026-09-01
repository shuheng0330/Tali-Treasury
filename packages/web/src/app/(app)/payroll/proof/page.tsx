import Link from 'next/link';
import { EnforcementProof } from '@/components/payroll/EnforcementProof';
import { sampleStaff } from '@/lib/mock/payroll';

export const metadata = {
  title: 'Underpaying EPF · Tali Treasury',
};

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

      <EnforcementProof person={sampleStaff[0]} />

      <p className="text-caption text-ink-3">
        Both outcomes become real testnet transactions once the payroll module is
        published. Until then the screen shows the decision the contract will make, and
        says so when nothing was submitted.
      </p>

      <Link href="/payroll" className="link self-start">
        Back to payroll
      </Link>
    </div>
  );
}
