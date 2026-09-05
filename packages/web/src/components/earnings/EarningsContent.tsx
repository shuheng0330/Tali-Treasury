'use client';

import type { SalaryStreamView } from '@tali/shared';
import { useEffect, useState } from 'react';

import { getRegisteredSalaryStream } from '@/lib/api/payroll';
import { PayrollSelection, usePayrollSelection } from '@/components/payroll/PayrollSelection';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { PAYROLL_EMPLOYEE } from '@/lib/demo-config';
import { can, viewerRoles } from '@/lib/viewer-role';
import { LiveBalance } from './LiveBalance';
import { TeamEarnings } from './TeamEarnings';

/**
 * One route, two screens, decided by who is signed in.
 *
 * The heading lives down here rather than in the page because it names
 * different things to different wallets, and a server-rendered "Your earnings"
 * over a list of somebody else's salaries would be the one thing on this screen
 * that lies.
 */
export function EarningsContent() {
  const session = useWalletSession();

  /* Held until the session resolves. Rendering the employee screen first and
     swapping would flash a Withdraw button at an employer who has nothing to
     withdraw. */
  if (session.status === 'loading') {
    return (
      <p className="mx-auto w-full max-w-md px-5 py-6 text-caption text-ink-3">
        Checking your wallet session…
      </p>
    );
  }

  const roles = viewerRoles(session.address, { employee: PAYROLL_EMPLOYEE });
  if (can(roles, 'overseeEarnings')) return <TeamEarnings />;

  return <OwnEarnings />;
}

function OwnEarnings() {
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
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Your earnings</h1>
        <p className="text-body text-ink-2">
          Your pay builds up every second you are employed. You can take what you
          have already earned whenever you need it.
        </p>
      </header>
      <PayrollSelection state={selection} />
      {error ? <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">The registered stream could not be read from this payroll.</p> : null}
      {selection.selected && !stream && !error ? <p className="rounded-card border border-dashed border-rule p-4 text-caption text-ink-3">No salary stream has been opened for this payroll yet.</p> : null}
      {selection.selected && stream ? <LiveBalance initial={stream} mandateId={selection.selected.mandateId} /> : null}
    </div>
  );
}
