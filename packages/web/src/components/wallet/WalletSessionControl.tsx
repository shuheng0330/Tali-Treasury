'use client';

import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useEffect, useState } from 'react';

import { ROLE_LABEL, viewerRole } from '@/lib/viewer-role';

import { useWalletSession } from './WalletSessionProvider';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletSessionControl() {
  const session = useWalletSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = viewerRole(session.address);

  if (!mounted) {
    return <button className="btn-secondary min-w-28" disabled>Loading wallet…</button>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2" aria-live="polite">
      <ConnectButton />
      {session.connectedAddress && session.status !== 'authenticated' ? (
        <button
          type="button"
          className="btn-primary"
          disabled={session.status === 'signing' || session.status === 'loading'}
          onClick={() => void session.signIn()}
        >
          {session.status === 'signing' ? 'Check wallet…' : 'Sign in'}
        </button>
      ) : null}
      {session.status === 'authenticated' && session.address ? (
        <>
          <span className="rounded-badge border border-ok-line bg-ok-soft px-2.5 py-1.5 font-mono text-caption text-ok">
            {role ? `${ROLE_LABEL[role]} · ` : ''}
            {shortAddress(session.address)}
          </span>
          <button type="button" className="btn-secondary" onClick={() => void session.signOut()}>
            Sign out
          </button>
        </>
      ) : null}
      {session.error ? (
        <p className="w-full text-right text-caption text-no">{session.error}</p>
      ) : null}
    </div>
  );
}
