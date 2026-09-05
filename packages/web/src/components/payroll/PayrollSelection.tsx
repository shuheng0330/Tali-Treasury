'use client';

import type { PayrollConfigurationView } from '@tali/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Select } from '@/components/Select';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { loadPayrollConfigurations } from '@/lib/payroll-configurations-client';
import { resolvePayrollSelection } from '@/lib/payroll-selection';

/**
 * Every payroll this wallet is party to, and the wallet that asked.
 *
 * Separated from the selection below because the two screens that need it want
 * different things from the same list: payroll and earnings pick one out of it,
 * while the employer's team view reads all of them at once. The revoked-session
 * handling is the part worth having in one place.
 */
export function usePayrollConfigurations() {
  const { address, signOut } = useWalletSession();
  const [configurations, setConfigurations] = useState<PayrollConfigurationView[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

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

  return { address, configurations, status };
}

export function usePayrollSelection() {
  const { address, configurations, status } = usePayrollConfigurations();
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get('payroll');

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
  /* The headline screen of the product lands here whenever nothing has been
     registered yet, so it says which two steps are missing rather than only
     that something is. Both are the employer's, and both are on chain. */
  if (state.configurations.length === 0)
    return (
      <div className="flex flex-col gap-2 rounded-card border border-dashed border-rule p-4">
        <p className="text-caption text-ink-2">
          No payroll is registered for this wallet yet, so there is no salary accruing to
          show.
        </p>
        <p className="text-caption text-ink-3">
          The employer creates one from{' '}
          <Link href="/payroll/setup" className="link">
            payroll setup
          </Link>{' '}
          and then opens a salary stream against it. Pay starts accruing the second that
          stream exists.
        </p>
      </div>
    );
  if (state.configurations.length === 1) return null;
  return (
    <Select
      label="Registered payroll"
      placeholder="Choose a payroll"
      value={state.selected?.mandateId ?? ''}
      onChange={(mandateId) => state.select(mandateId)}
      options={state.configurations.map((configuration) => ({
        value: configuration.mandateId,
        label: `${configuration.mandateId.slice(0, 10)}…`,
        note: configuration.role,
      }))}
    />
  );
}
