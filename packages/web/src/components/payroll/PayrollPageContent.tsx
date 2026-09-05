'use client';

import { PayrollDesk } from './PayrollDesk';
import { PayrollSelection, usePayrollSelection } from './PayrollSelection';

export function PayrollPageContent({ runsAreLive }: { runsAreLive: boolean }) {
  const selection = usePayrollSelection();
  return <><PayrollSelection state={selection} />{selection.selected ? <PayrollDesk configuration={selection.selected} runsAreLive={runsAreLive} stage="mandated" /> : null}</>;
}
