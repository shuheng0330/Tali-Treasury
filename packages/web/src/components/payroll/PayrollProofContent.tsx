'use client';

import type { PayrollBreakdown } from '@tali/shared';
import { useEffect, useState } from 'react';

import { tryPreviewPayroll } from '@/lib/api/payroll';
import { EnforcementProof } from './EnforcementProof';
import { PayrollSelection, usePayrollSelection } from './PayrollSelection';

export function PayrollProofContent() {
  const selection = usePayrollSelection();
  const [breakdown, setBreakdown] = useState<PayrollBreakdown | null>(null);
  useEffect(() => {
    if (!selection.selected) { setBreakdown(null); return; }
    let current = true;
    setBreakdown(null);
    void tryPreviewPayroll({ mandateId: selection.selected.mandateId, gross: '3000000000', age: 30, citizenship: 'local' })
      .then((result) => current && setBreakdown(result.data));
    return () => { current = false; };
  }, [selection.selected]);
  const epf = selection.selected?.statutoryRules.find((rule) => rule.body === 'epf');
  return <><PayrollSelection state={selection} />{selection.selected && breakdown && epf ? <EnforcementProof mandateId={selection.selected.mandateId} person={{ name: 'Registered employee', role: 'Payroll employee', address: selection.selected.employee, breakdown }} epfFloorBps={epf.minBps} stage="mandated" /> : selection.selected ? <p className="text-caption text-ink-3">Loading the selected payroll proof…</p> : null}</>;
}
