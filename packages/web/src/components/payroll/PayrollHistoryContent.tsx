'use client';

import type { ListPayrollRunsResponse, PayrollRunView } from '@tali/shared';
import { useEffect, useState } from 'react';

import { DataNotice } from '@/components/DataNotice';
import { PayrollSelection, usePayrollSelection } from './PayrollSelection';
import { RunHistory } from './RunHistory';

export function PayrollHistoryContent() {
  const selection = usePayrollSelection();
  const [runs, setRuns] = useState<PayrollRunView[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [persisted, setPersisted] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!selection.selected) return;
    let current = true;
    setState('loading');
    fetch(`/api/payroll/runs?payroll=${encodeURIComponent(selection.selected.mandateId)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        return response.json() as Promise<ListPayrollRunsResponse>;
      })
      .then((body) => {
        if (!current) return;
        setRuns(body.runs);
        setPersisted(body.persisted);
        setWarning(body.storageWarning ?? null);
        setState('idle');
      })
      .catch(() => current && setState('error'));
    return () => { current = false; };
  }, [selection.selected]);

  return <div className="flex flex-col gap-5">
    <PayrollSelection state={selection} />
    {state === 'loading' ? <p className="text-caption text-ink-3">Loading this payroll’s history…</p> : null}
    {state === 'error' ? <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">This payroll’s run history could not be read. Nothing was retried or paid.</p> : null}
    {selection.selected && state === 'idle' ? <><DataNotice source={persisted ? 'live' : 'mock'} reason={warning} live="These runs" simulated="They are real attempts scoped to the selected registered payroll." plural /><RunHistory runs={runs} /></> : null}
  </div>;
}
