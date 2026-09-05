import { LeaveRequestForm } from '@/components/leave/LeaveRequestForm';

export const metadata = {
  title: 'Leave · Tali Treasury',
};

/* The requests are read against the signed-in wallet, so nothing here can be
   settled at build time and baked into a static page. */
export const dynamic = 'force-dynamic';

export default function LeavePage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Leave</h1>
        <p className="text-body text-ink-2">
          Ask for time off. The employer approves it, and only unpaid leave changes what the
          next payroll run pays.
        </p>
      </header>

      <LeaveRequestForm />
    </div>
  );
}
