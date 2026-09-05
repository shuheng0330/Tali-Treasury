'use client';

import type { SalaryStreamView } from '@tali/shared';
import { useEffect, useState } from 'react';

import { getRegisteredSalaryStream } from '@/lib/api/payroll';
import { PayrollSelection, usePayrollSelection } from '@/components/payroll/PayrollSelection';
import { LiveBalance } from './LiveBalance';

export function EarningsContent() {
  const selection = usePayrollSelection();
  const [stream, setStream] = useState<SalaryStreamView | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!selection.selected) { setStream(null); return; }
    let current = true;
    setStream(null);
    setError(false);
    getRegisteredSalaryStream(selection.selected.mandateId)
      .then(async ({ stream: registration }) => {
        if (!registration) return null;
        const response = await fetch(`/api/streams/${registration.streamId}?payroll=${encodeURIComponent(selection.selected!.mandateId)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('unavailable');
        return response.json() as Promise<SalaryStreamView>;
      })
      .then((value) => current && setStream(value))
      .catch(() => current && setError(true));
    return () => { current = false; };
  }, [selection.selected]);
  return <><PayrollSelection state={selection} />{error ? <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">The registered stream could not be read from this payroll.</p> : null}{selection.selected && !stream && !error ? <p className="rounded-card border border-dashed border-rule p-4 text-caption text-ink-3">No salary stream has been opened for this payroll yet.</p> : null}{selection.selected && stream ? <LiveBalance initial={stream} mandateId={selection.selected.mandateId} /> : null}</>;
}
