'use client';

import type { SalaryStreamView } from '@tali/shared';
import { useEffect, useState } from 'react';

import { DEMO_STREAM_ID } from '@/lib/demo-config';
import { PayrollSelection, usePayrollSelection } from '@/components/payroll/PayrollSelection';
import { LiveBalance } from './LiveBalance';

export function EarningsContent() {
  const selection = usePayrollSelection();
  const [stream, setStream] = useState<SalaryStreamView | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!selection.selected || !DEMO_STREAM_ID) { setStream(null); return; }
    let current = true;
    setStream(null);
    setError(false);
    fetch(`/api/streams/${DEMO_STREAM_ID}?payroll=${encodeURIComponent(selection.selected.mandateId)}`, { cache: 'no-store' })
      .then(async (response) => { if (!response.ok) throw new Error('unavailable'); return response.json() as Promise<SalaryStreamView>; })
      .then((value) => current && setStream(value))
      .catch(() => current && setError(true));
    return () => { current = false; };
  }, [selection.selected]);
  return <><PayrollSelection state={selection} />{error ? <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">The configured stream does not match this registered payroll, employee, or wallet.</p> : null}{selection.selected && stream ? <LiveBalance initial={stream} mandateId={selection.selected.mandateId} /> : null}</>;
}
