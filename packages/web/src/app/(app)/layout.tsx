import Link from 'next/link';
import { AppNav } from '@/components/AppNav';

/**
 * Every screen in this group used to be a dead end: once you were on one, the
 * only way out was the browser's back button, which does not exist on a phone
 * opened from the QR code.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-rule bg-canvas">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <Link
            href="/"
            className="group flex items-center gap-2 text-subhead font-semibold transition-colors duration-150 hover:text-ink-2"
          >
            <span
              aria-hidden
              className="text-ink-3 transition-transform duration-150 ease-pop group-hover:-translate-x-0.5"
            >
              ←
            </span>
            Tali Treasury
          </Link>
          <AppNav />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto border-t border-rule">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-caption text-ink-3 sm:px-6">
          <p>Sui testnet · no real funds</p>
          <div className="flex flex-wrap gap-6">
            <Link href="/" className="underline underline-offset-4 hover:text-ink-2">
              Back to the overview
            </Link>
            <Link href="/system" className="underline underline-offset-4 hover:text-ink-2">
              Design system
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
