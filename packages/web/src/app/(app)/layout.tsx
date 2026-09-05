import Link from 'next/link';
import { AppNav } from '@/components/AppNav';
import { SectionNav } from '@/components/SectionNav';
import { SectionGuard } from '@/components/RequireCapability';
import { BackButton } from '@/components/BackButton';
import { WalletSessionControl } from '@/components/wallet/WalletSessionControl';
import { WalletSessionBoundary } from '@/components/wallet/WalletSessionBoundary';

/**
 * Every screen in this group used to be a dead end: once you were on one, the
 * only way out was the browser's back button, which does not exist on a phone
 * opened from the QR code.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletSessionBoundary>
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:px-6 sm:py-4">
          <BackButton />

          <Link
            href="/"
            className="group flex min-w-0 items-center gap-2.5 font-display text-subhead font-semibold transition-colors duration-150 hover:text-accent-ink"
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-badge bg-accent transition-transform duration-200 ease-pop group-hover:scale-125"
            />
            <span className="truncate">Tali Treasury</span>
          </Link>

          {/* Wallet sits on the top row beside the wordmark, not on a third row
              of its own under the tabs. Stacked below the nav it read as a
              piece of the page rather than the account control, and it pushed
              the sticky header to 165px on a phone. Source order is the mobile
              order; sm reorders it back to nav-then-wallet. */}
          <WalletSessionControl className="ml-auto sm:order-3 sm:ml-0" />
          <AppNav className="w-full sm:order-2 sm:ml-auto sm:w-auto" />
        </div>
      </header>

      <SectionNav />

      <main className="flex-1">
        <SectionGuard>{children}</SectionGuard>
      </main>

      <footer className="mt-auto border-t border-rule">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-8 text-caption text-ink-3 sm:px-6">
          <p className="eyebrow">Network · Sui Testnet</p>
          <div className="flex flex-wrap gap-6">
            <Link href="/" className="link">
              Back to the overview
            </Link>
          </div>
        </div>
      </footer>
    </div>
    </WalletSessionBoundary>
  );
}
