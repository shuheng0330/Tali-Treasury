'use client';

import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useEffect, useState } from 'react';

import { ROLE_LABEL, viewerRole } from '@/lib/viewer-role';

import { useWalletSession } from './WalletSessionProvider';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * `btn-primary` and `btn-secondary` were never CSS rules — this file was the
 * only place in the codebase using those names, and the convention everywhere
 * else is `btn btn--primary`. The sign-in and sign-out controls were rendering
 * as unstyled browser buttons in the header, which is most of why the wallet
 * corner looked wrong next to everything around it.
 */
export function WalletSessionControl({ className = '' }: { className?: string }) {
  const session = useWalletSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = viewerRole(session.address);

  if (!mounted) {
    return (
      <div className={`flex items-center justify-end ${className}`}>
        <button className="btn btn--ghost h-9 min-w-28 px-3 text-label sm:px-4" disabled>
          Loading wallet…
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-end gap-2 ${className}`}
      aria-live="polite"
    >
      <ConnectButton />
      {session.connectedAddress && session.status !== 'authenticated' ? (
        <button
          type="button"
          className="btn btn--primary h-9 px-3 text-label sm:px-4"
          disabled={session.status === 'signing' || session.status === 'loading'}
          onClick={() => void session.signIn()}
        >
          {session.status === 'signing' ? 'Check wallet…' : 'Sign in'}
        </button>
      ) : null}
      {session.status === 'authenticated' && session.address ? (
        <>
          {/* The address is dropped on a phone, not hidden information: the
              connect button beside this one is an account menu that formats the
              same address itself, and repeating it was what pushed the wallet
              cluster onto a row of its own under the tabs. The role is the part
              that is only here. */}
          <span className="rounded-badge border border-ok-line bg-ok-soft px-2 py-1.5 font-mono text-caption text-ok sm:px-2.5">
            {role ? ROLE_LABEL[role] : shortAddress(session.address)}
            {role ? (
              <span className="hidden sm:inline"> · {shortAddress(session.address)}</span>
            ) : null}
          </span>
          <button type="button" className="btn btn--ghost h-9 px-3 text-label sm:px-4" onClick={() => void session.signOut()}>
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
