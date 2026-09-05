'use client';

import Link from 'next/link';

import { RoleNotice } from '@/components/RoleNotice';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { EMPLOYER_WALLET, PAYROLL_EMPLOYEE } from '@/lib/demo-config';
import { can, viewerRoles, type Capability } from '@/lib/viewer-role';
import {
  EMPLOYEE_COPY,
  REVIEW_COPY,
  SETUP_COPY,
  walletAccess,
  type Access,
} from '@/lib/wallet-access';

/**
 * A stream that has not been opened yet reports a placeholder employee, and
 * comparing a real wallet against it would answer "not yours" to everybody
 * with the confidence of a real check. An address that is not canonical is
 * treated as unconfigured, which `walletAccess` already explains honestly.
 */
const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

function configured(address: string | null): string {
  const value = address?.trim() ?? '';
  return SUI_ADDRESS.test(value) ? value : '';
}

interface Destination {
  href: string;
  title: string;
  blurb: string;
  /** What the wallet must hold for this card to be worth offering. */
  capability: Capability;
  access: Access | null;
}

function Card({ destination }: { destination: Destination }) {
  const { href, title, blurb, access } = destination;
  /* A card with no authority to check is never marked. `walletAccess` refuses a
     null address first, so `permitted` already implies somebody is signed in —
     but treating "cannot check" as "yes" put a Yours badge on the claim card
     with nobody signed in at all. */
  const yours = access !== null && access.permitted;

  return (
    <li className="flex flex-col">
      <Link
        href={href}
        className={`flex flex-col gap-1 rounded-card border p-5 transition-colors duration-150 ${
          yours
            ? 'border-accent-line bg-accent-soft hover:bg-raised'
            : 'border-rule bg-surface hover:bg-raised'
        }`}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-display text-subhead">{title}</span>
          {yours ? <span className="eyebrow text-accent-ink">Yours</span> : null}
        </span>
        <span className="text-caption text-ink-2">{blurb}</span>
      </Link>
      {access?.notice ? (
        <span className="px-1 pt-2 text-caption text-ink-3">{access.notice}</span>
      ) : null}
    </li>
  );
}

export function RoleChooser({
  treasurer,
  employee,
}: {
  /** Recorded on the event being demonstrated. */
  treasurer: string | null;
  /** Recorded on the salary stream, when one has been opened. */
  employee: string | null;
}) {
  const { address } = useWalletSession();

  const roles = viewerRoles(address, { employee: configured(employee) || PAYROLL_EMPLOYEE });
  const employer = can(roles, 'overseeEarnings');

  const employerAccess = walletAccess(address, EMPLOYER_WALLET, SETUP_COPY);
  const treasurerAccess = walletAccess(address, configured(treasurer), REVIEW_COPY);
  const employeeAccess = walletAccess(address, configured(employee), EMPLOYEE_COPY);

  const destinations: Destination[] = [
    {
      href: '/payroll/setup',
      title: 'Set up payroll',
      blurb: 'Put money aside for wages. The rules cannot be changed afterwards.',
      capability: 'runPayroll',
      access: employerAccess,
    },
    {
      href: '/approvals',
      title: 'Decide requests',
      blurb: 'Overtime and leave your team has asked for, waiting on a yes or a no.',
      capability: 'approve',
      access: employerAccess,
    },
    {
      href: '/treasury',
      title: 'Review claims',
      blurb: 'What is left in the budget, what is waiting, and what has been paid.',
      capability: 'holdTreasury',
      access: treasurerAccess,
    },
    {
      href: '/earnings',
      title: employer ? 'Team earnings' : 'Your earnings',
      blurb: employer
        ? 'Every salary you pay, accruing by the second. Nothing here is yours to draw.'
        : 'Wages accrue every second. Withdraw what you have already earned.',
      capability: employer ? 'overseeEarnings' : 'earn',
      /* The employer is not the wallet any stream names, so checking them
         against one would badge their own screen "not yours". */
      access: employer ? null : employeeAccess,
    },
    {
      /* Membership is a row in the database rather than a configured wallet, so
         this screen does not pretend to know it. The claim flow checks. */
      href: '/requests/expense',
      title: 'Claim an expense',
      blurb: 'Photograph a receipt and get your money back.',
      capability: 'request',
      access: null,
    },
  ];

  /* Signed out shows everything, exactly as the navigation does: there is no
     answer yet about who this is, and hiding on the strength of not knowing
     would leave a first-time visitor an empty page. */
  const shown = destinations.filter(
    (destination) => roles.size === 0 || can(roles, destination.capability),
  );

  const signedIn = address !== null;
  const holdsSomething =
    employer || treasurerAccess.permitted || employeeAccess.permitted;

  return (
    <div className="flex flex-col gap-6">
      {!signedIn ? (
        <RoleNotice
          access={{
            permitted: false,
            notice:
              'Connect a wallet to see which of these are yours.',
          }}
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {shown.map((destination) => (
          <Card key={destination.href} destination={destination} />
        ))}
      </ul>

      {signedIn && !holdsSomething ? (
        <div className="flex flex-col gap-2 rounded-card border border-rule bg-raised p-5">
          <p className="text-body text-ink-2">
            This wallet has no role here yet.
          </p>
          <p className="text-caption text-ink-3">
            The best parts need no permission:{' '}
            <Link href="/safety/payroll" className="link">
              watch a payroll get refused for skipping EPF
            </Link>{' '}
            or{' '}
            <Link href="/safety" className="link">
              try to break a spending rule
            </Link>
            .
          </p>
        </div>
      ) : null}
    </div>
  );
}
