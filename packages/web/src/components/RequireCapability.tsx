'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { PAYROLL_EMPLOYEE } from '@/lib/demo-config';
import { activeSection, visibleSections } from '@/lib/nav';
import { ROLE_LABEL, can, viewerRole, viewerRoles, type Capability } from '@/lib/viewer-role';
import { useWalletSession } from './wallet/WalletSessionProvider';

/** Whose screen this is, said in the words the reader would use. */
const HOLDER: Record<Capability, string> = {
  request: 'anyone signed in',
  approve: 'the employer',
  runPayroll: 'the employer',
  holdTreasury: 'the treasurer',
  earn: 'the employee being paid',
  proof: 'anyone',
};

function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function NoAccess({ capability, address }: { capability: Capability; address: string }) {
  const roles = viewerRoles(address, { employee: PAYROLL_EMPLOYEE });
  const role = viewerRole(address);
  const mine = visibleSections(roles);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-10">
      <section className="flex flex-col gap-3 rounded-panel border border-rule bg-surface p-5">
        <h1 className="eyebrow">Not your screen</h1>
        <p className="text-body-lg">
          This one belongs to {HOLDER[capability]}.
        </p>
        <p className="text-body text-ink-2">
          You are signed in as{' '}
          <span className="font-mono">{short(address)}</span>
          {role ? <> — the {ROLE_LABEL[role].toLowerCase()}</> : null}. Nothing was refused
          on the way here; this screen simply is not part of what that wallet does.
        </p>
      </section>

      {mine.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="eyebrow">Where you can go</h2>
          <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-card border border-rule bg-surface">
            {mine.map((section) => (
              <li key={section.href}>
                <Link
                  href={section.href}
                  className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-body transition-colors duration-150 hover:bg-raised"
                >
                  <span className="font-medium">{section.label}</span>
                  <span className="text-caption text-ink-3">{section.full}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link href="/" className="link self-start">
        Back to the overview
      </Link>
    </div>
  );
}

/**
 * A screen that only some wallets are meant to reach.
 *
 * The navigation already hides what a wallet cannot do, so this is for the URL
 * typed, bookmarked or followed from a message — and for the moment after
 * somebody switches accounts in their wallet while standing on a screen the new
 * account does not hold. Left unguarded, those cases render an employer's queue
 * to an employee and let them press Approve, which the server then refuses with
 * a 403 that explains nothing.
 *
 * A signed-out visitor is shown the screen. There is no answer yet about who
 * they are, and every screen underneath already says which wallet it wants;
 * hiding on the strength of not knowing would leave a first-time visitor an app
 * that looks broken.
 */
export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children: React.ReactNode;
}) {
  const session = useWalletSession();

  if (session.status === 'loading') {
    return (
      <p className="mx-auto w-full max-w-md px-5 py-10 text-caption text-ink-3">
        Checking your wallet session…
      </p>
    );
  }

  const address = session.address;
  if (!address) return <>{children}</>;

  const roles = viewerRoles(address, { employee: PAYROLL_EMPLOYEE });
  if (can(roles, capability)) return <>{children}</>;

  return <NoAccess capability={capability} address={address} />;
}

/**
 * The same guard, reading the capability off the route rather than a prop.
 *
 * Mounted once in the app layout, so a section gains its guard by being in
 * `NAV_SECTIONS` and every screen inside it is covered — including the ones
 * added later, which is the failure mode a per-page guard has. A path that
 * belongs to no section, like the design system reference, is not gated at all.
 */
export function SectionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = activeSection(pathname);
  if (!section) return <>{children}</>;

  return <RequireCapability capability={section.capability}>{children}</RequireCapability>;
}
