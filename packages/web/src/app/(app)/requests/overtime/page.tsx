import { OvertimeClaimForm } from '@/components/overtime/OvertimeClaimForm';

export const metadata = {
  title: 'Overtime · Tali Treasury',
};

/* The claims are read against the signed-in wallet, so nothing here can be
   settled at build time and baked into a static page. */
export const dynamic = 'force-dynamic';

export default function OvertimePage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Overtime</h1>
        <p className="text-body text-ink-2">
          Log extra hours. Approved overtime is added to your next payroll.
        </p>
      </header>

      <OvertimeClaimForm />
    </div>
  );
}
