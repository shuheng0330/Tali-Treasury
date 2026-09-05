'use client';

import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useEffect, useRef, useState } from 'react';

import { ROLE_LABEL, viewerRole } from '@/lib/viewer-role';

import { useWalletSession } from './WalletSessionProvider';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * One account control, not three.
 *
 * Signed in, this used to put the wallet's own button, a role chip and a sign
 * out button side by side in the header. At 375px that is 363px of controls in
 * a 343px row, so it wrapped into a ragged two-line block under the wordmark —
 * three different shapes, three different colours, no grouping. The convention
 * every dApp and every account menu settles on is a single button showing who
 * you are, opening a menu that holds the address, a way to copy it, and the way
 * out.
 *
 * The wallet's own button is what does that job while signing in, so it stays
 * for the connect and sign-in states. Once there is a session it is replaced
 * rather than sat beside: signing out returns it, and with it the wallet's
 * disconnect, one step behind instead of permanently in the header.
 *
 * `btn-primary` and `btn-secondary`, used here and nowhere else in the
 * codebase, were never CSS rules — these controls had been rendering as
 * unstyled browser buttons.
 */
export function WalletSessionControl({ className = '' }: { className?: string }) {
  const session = useWalletSession();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  const role = viewerRole(session.address);

  /* A menu that only closes by pressing its own trigger again reads as stuck.
     Escape as well as an outside press, because the trigger keeps focus. */
  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!mounted) {
    return (
      <div className={`flex items-center justify-end ${className}`}>
        <button className="btn btn--ghost h-9 min-w-28 px-3 text-label sm:px-4" disabled>
          Loading wallet…
        </button>
      </div>
    );
  }

  const authenticated = session.status === 'authenticated' && session.address;

  return (
    <div
      className={`flex flex-wrap items-center justify-end gap-2 ${className}`}
      aria-live="polite"
    >
      {authenticated ? null : <ConnectButton />}

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

      {authenticated && session.address ? (
        <div className="relative" ref={menu}>
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((was) => !was)}
            className="btn btn--ghost h-9 gap-2 px-3 text-label sm:px-4"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-badge bg-ok"
            />
            {role ? ROLE_LABEL[role] : shortAddress(session.address)}
            <svg
              viewBox="0 0 12 12"
              width="10"
              height="10"
              aria-hidden
              className={`shrink-0 transition-transform duration-200 ease-pop ${open ? 'rotate-180' : ''}`}
            >
              <path
                d="M2.5 4.5 L6 8 L9.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {open ? (
            <div
              className="absolute right-0 top-[calc(100%+0.5rem)] z-40 flex w-[17rem] max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-card border border-rule bg-canvas p-4 text-left shadow-float"
              role="menu"
            >
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">Signed in on Sui testnet</span>
                <span className="break-all font-mono text-caption text-ink-2">
                  {session.address}
                </span>
                {role ? (
                  <span className="text-caption text-ink-3">
                    This wallet is the {ROLE_LABEL[role].toLowerCase()}.
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="btn btn--ghost h-9 w-full px-4 text-label"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(session.address ?? '')
                      .then(() => setCopied(true))
                      .catch(() => setCopied(false));
                  }}
                >
                  {copied ? 'Copied' : 'Copy address'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost h-9 w-full px-4 text-label"
                  onClick={() => {
                    setOpen(false);
                    void session.signOut();
                  }}
                >
                  Sign out
                </button>
              </div>

              {/* Says where the wallet's own controls went, rather than leaving
                  a reader to conclude they are gone. */}
              <p className="text-caption text-ink-3">
                Signing out brings back the wallet button, where disconnecting
                and switching account live.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {session.error ? (
        <p className="w-full text-right text-caption text-no">{session.error}</p>
      ) : null}
    </div>
  );
}
