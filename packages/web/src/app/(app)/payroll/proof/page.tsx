import Link from 'next/link';
import { EnforcementProof } from '@/components/payroll/EnforcementProof';
import { payrollStaff } from '@/lib/mock/payroll';
import { readEpfFloor } from '@/server/payroll/floors';

export const metadata = {
  title: 'Underpaying EPF · Tali Treasury',
};

export const dynamic = 'force-dynamic';

export default async function PayrollProofPage() {
  const floor = await readEpfFloor();

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

      <EnforcementProof
        person={payrollStaff()[0]!}
        epfFloorBps={floor.epfBps.toString()}
      />

      <p className="text-caption text-ink-3">
        {floor.source === 'chain'
          ? 'The minimum above was read from the mandate itself, so it is the figure the contract will actually enforce.'
          : 'The minimum above is the floor this mandate is created with. It has not been read off the chain, because the payroll module is not published yet.'}{' '}
        Both outcomes become real testnet transactions once it is.
      </p>

      <Link href="/payroll" className="link self-start">
        Back to payroll
      </Link>
    </div>
  );
}
