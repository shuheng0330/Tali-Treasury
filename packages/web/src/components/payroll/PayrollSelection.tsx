'use client';

import type { PayrollConfigurationView } from '@tali/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { loadPayrollConfigurations } from '@/lib/payroll-configurations-client';
import { resolvePayrollSelection } from '@/lib/payroll-selection';

export function usePayrollSelection() {
  const { address, signOut } = useWalletSession();
  const params = useSearchParams();
  const router = useRouter();
  const [configurations, setConfigurations] = useState<PayrollConfigurationView[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const requested = params.get('payroll');

  useEffect(() => {
    if (!address) {
      setConfigurations([]);
      setStatus('ready');
      return;
    }
    let current = true;
    setStatus('loading');
    loadPayrollConfigurations()
      .then(async (result) => {
        if (!current) return;
        if (result.status === 'unauthorized') {
          /* The server session can be revoked by another tab or a wallet account
             transition before the provider's local state notices. Clear both
             sides so the user gets a real Sign in action instead of a dead-end
             payroll error. */
          await signOut();
          if (!current) return;
          setConfigurations([]);
          setStatus('ready');
          return;
        }
        setConfigurations(result.configurations);
        setStatus('ready');
      })
      .catch(() => current && setStatus('error'));
    return () => { current = false; };
  }, [address, signOut]);

  const resolution = useMemo(
    () => resolvePayrollSelection(configurations, requested),
    [configurations, requested],
  );
  const selected = resolution.selected;

  useEffect(() => {
    if (status !== 'ready' || !resolution.autoSelect) return;
    const next = new URLSearchParams(params.toString());
    next.set('payroll', resolution.autoSelect);
    router.replace(`?${next.toString()}`);
  }, [params, resolution.autoSelect, router, status]);

  function select(mandateId: string) {
    const next = new URLSearchParams(params.toString());
    next.set('payroll', mandateId);
    router.replace(`?${next.toString()}`);
  }

  return { address, configurations, selected, requested, select, status };
}

export function PayrollSelection({
  state,
}: {
  state: ReturnType<typeof usePayrollSelection>;
}) {
  if (!state.address) return <p className="rounded-card border border-rule p-4 text-caption">Connect and sign in with your Sui wallet to access payroll.</p>;
  if (state.status === 'loading') return <p className="text-caption text-ink-3">Loading registered payrolls…</p>;
  if (state.status === 'error') return <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">Registered payrolls could not be loaded.</p>;
  if (state.configurations.length === 0) return <p className="rounded-card border border-dashed border-rule p-4 text-caption text-ink-3">No registered payroll is available to this wallet. The employer can register one from payroll setup.</p>;
  if (state.configurations.length === 1) return null;
  return (
    <label className="flex flex-col gap-2 text-caption text-ink-2">
      Registered payroll
      <select className="input" value={state.selected?.mandateId ?? ''} onChange={(event) => state.select(event.target.value)}>
        <option value="" disabled>Choose a payroll</option>
        {state.configurations.map((configuration) => (
          <option key={configuration.mandateId} value={configuration.mandateId}>
            {configuration.mandateId.slice(0, 10)}… · {configuration.role}
          </option>
        ))}
      </select>
    </label>
  );
}
