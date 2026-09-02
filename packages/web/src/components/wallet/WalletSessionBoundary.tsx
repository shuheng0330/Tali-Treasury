'use client';

import dynamic from 'next/dynamic';

const BrowserWalletSessionProvider = dynamic(
  () =>
    import('./WalletSessionProvider').then((module) => module.WalletSessionProvider),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-dvh items-center justify-center bg-canvas text-caption text-ink-3">
        Loading Sui wallet…
      </div>
    ),
  },
);

export function WalletSessionBoundary({ children }: { children: React.ReactNode }) {
  return <BrowserWalletSessionProvider>{children}</BrowserWalletSessionProvider>;
}
