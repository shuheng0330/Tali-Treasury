'use client';

import { PayrollDesk } from './PayrollDesk';
import { PayrollSelection, usePayrollSelection } from './PayrollSelection';
import { SalaryStreamSetup } from './SalaryStreamSetup';

export function PayrollPageContent({ runsAreLive }: { runsAreLive: boolean }) {
  const selection = usePayrollSelection();
  return <><PayrollSelection state={selection} />{selection.selected ? <><PayrollDesk configuration={selection.selected} runsAreLive={runsAreLive} stage="mandated" />{selection.selected.role === 'employer' ? <SalaryStreamSetup configuration={selection.selected} /> : null}</> : null}</>;
}
