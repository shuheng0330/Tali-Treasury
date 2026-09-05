'use client';

import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useEffect, useRef, useState } from 'react';

import { ROLE_LABEL, viewerRole } from '@/lib/viewer-role';

import { useWalletSession } from './WalletSessionProvider';

/* 44px tall, full-bleed and highlighted on hover: a menu of rows scans faster
   than a stack of identically outlined buttons, which is what this was. */
const ROW =
  'flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 text-left text-body text-ink transition-colors duration-150 hover:bg-raised focus-visible:bg-raised';

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

  const copy = () => {
    void navigator.clipboard
      ?.writeText(session.address ?? '')
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

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
              className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-rule bg-canvas text-left shadow-float"
              role="menu"
            >
              {/* Truncated, with copy underneath, rather than 66 characters of
                  hex wrapped over three lines. Every wallet UI settles on the
                  short form for the same reason: the full address is something
                  you copy, not something you read. */}
              <div className="flex flex-col gap-1 border-b border-rule px-4 py-3">
                {/* Names the network, not the role: the trigger already says
                    the role, and which chain this is is the fact a reader of a
                    payroll app most needs and cannot get anywhere else here. */}
                <span className="eyebrow">Signed in on Sui testnet</span>
                <span className="font-mono text-caption text-ink-2">
                  {shortAddress(session.address)}
                </span>
              </div>

              <div className="flex flex-col p-1.5">
                <button type="button" role="menuitem" className={ROW} onClick={copy}>
                  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden className="shrink-0 text-ink-3">
                    <rect x="5.5" y="5.5" width="8" height="8" rx="1.8" />
                    <path d="M10.5 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v6.7" strokeLinecap="round" />
                  </svg>
                  {copied ? 'Copied' : 'Copy address'}
                </button>

                <a
                  role="menuitem"
                  href={`https://suiscan.xyz/testnet/account/${session.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className={ROW}
                  onClick={() => setOpen(false)}
                >
                  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-ink-3">
                    <path d="M9.5 2.5H13.5V6.5" />
                    <path d="M13.5 2.5L7.5 8.5" />
                    <path d="M12.5 9.8v3A1.2 1.2 0 0 1 11.3 14H3.2A1.2 1.2 0 0 1 2 12.8V4.7a1.2 1.2 0 0 1 1.2-1.2h3" />
                  </svg>
                  View on Suiscan
                </a>
              </div>

              <div className="flex flex-col border-t border-rule p-1.5">
                <button
                  type="button"
                  role="menuitem"
                  className={ROW}
                  onClick={() => {
                    setOpen(false);
                    void session.signOut();
                  }}
                >
                  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-ink-3">
                    <path d="M6.5 13.5H3.2A1.2 1.2 0 0 1 2 12.3V3.7a1.2 1.2 0 0 1 1.2-1.2h3.3" />
                    <path d="M10.5 11 14 8l-3.5-3M14 8H6.5" />
                  </svg>
                  Sign out
                </button>
              </div>

              <p className="border-t border-rule px-4 py-3 text-caption text-ink-3">
                Sign out first to disconnect the wallet.
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
