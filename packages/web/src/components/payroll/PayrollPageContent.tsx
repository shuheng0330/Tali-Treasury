'use client';

import { PayrollDesk } from './PayrollDesk';
import { PayrollSelection, usePayrollSelection } from './PayrollSelection';
import { SalaryStreamSetup } from './SalaryStreamSetup';

/**
 * Two jobs, and a rule between them.
 *
 * Running this month's payroll and opening a salary stream are unrelated, and
 * they used to be adjacent siblings of one `gap-6` column wearing the same card
 * skin — so the gap between the end of one job and the start of the other was
 * identical to the gap between two rows inside the first. Nothing on screen said
 * where one ended.
 */
export function PayrollPageContent({ runsAreLive }: { runsAreLive: boolean }) {
  const selection = usePayrollSelection();
  if (!selection.selected) return <PayrollSelection state={selection} />;

  return (
    <div className="flex flex-col gap-5">
      <PayrollSelection state={selection} />
      <PayrollDesk
        configuration={selection.selected}
        runsAreLive={runsAreLive}
        stage="mandated"
      />
      {selection.selected.role === 'employer' ? (
        <div className="mt-3 flex flex-col gap-4 border-t border-rule pt-8">
          <SalaryStreamSetup configuration={selection.selected} />
        </div>
      ) : null}
    </div>
  );
}
