import Link from 'next/link';
import { EXPLORER, toDisplay } from '@tali/shared';
import { mandate } from '@/lib/mock/data';
import { sampleStaff } from '@/lib/mock/payroll';
import { TALI_TESTNET_PACKAGE_ID } from '@tali/treasury-sui';
import { SPEND_CHECKS } from '@/lib/checks';
import { RUN_TALLY } from '@/lib/evidence';
import { CheckMarquee } from '@/components/landing/CheckMarquee';
import { Evidence } from '@/components/landing/Evidence';
import { PhoneCode } from '@/components/landing/PhoneCode';
import { PayrollSplit } from '@/components/landing/PayrollSplit';
import { REFUSED_AMOUNT, Wire } from '@/components/landing/Wire';

const PACKAGE_SHORT = `${TALI_TESTNET_PACKAGE_ID.slice(0, 6)}…${TALI_TESTNET_PACKAGE_ID.slice(-4)}`;
const PACKAGE_LINK = EXPLORER.object(TALI_TESTNET_PACKAGE_ID).suivision;

export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 sm:px-8">
          <span className="flex items-center gap-2.5 font-display text-subhead font-semibold">
            <span aria-hidden className="h-2.5 w-2.5 rounded-badge bg-accent" />
            Tali Treasury
          </span>
          <div className="flex items-center gap-5">
            <span className="eyebrow hidden sm:inline-flex">Sui testnet</span>
            {/* The generic way in cannot assume the visitor is the employer.
                The hero button below is labelled "Set up payroll" and may go
                straight there; this one says only "open the app". */}
            <Link href="/start" className="btn btn--primary h-10 px-5">
              Open the app
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 pt-20 pb-16 sm:px-8 md:pt-32 md:pb-24">
        <p className="eyebrow">
          <span aria-hidden className="h-1.5 w-1.5 rounded-badge bg-accent" />
          Payroll for Malaysian teams
        </p>

        <h1 className="font-display text-hero">
          Wages and EPF leave together.
          <span className="block text-accent-ink">Or neither of them moves.</span>
        </h1>

        <p className="max-w-2xl text-lead text-ink-2">
          Pay the salary and the EPF together. If either one is short, nothing leaves at all.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/payroll/setup" className="btn btn--accent btn--lg">
            Set up payroll
          </Link>
          <Link href="/payroll" className="btn btn--ghost btn--lg">
            Run a payroll
          </Link>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pb-20 sm:px-8 md:pb-28">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">One salary, one transaction</p>
          <h2 className="max-w-3xl text-title">
            {sampleStaff[0]!.name} earns RM{toDisplay(sampleStaff[0]!.breakdown.gross)} a
            month. Four payments leave at once.
          </h2>
          <p className="max-w-2xl text-body-lg text-ink-2">
            The worker, EPF, SOCSO and EIS — at the official rates, worked out for you.
          </p>
        </div>

        <PayrollSplit />

        <p className="max-w-3xl text-body text-ink-2">
          Short any one of them by a single sen and the whole run is refused. Nothing goes out
          and gets corrected later.{' '}
          <Link href="/safety/payroll" className="link">
            Try skipping the EPF and see
          </Link>
          .
        </p>
      </section>

      <CheckMarquee />

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-20 sm:px-8 md:py-28">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">The same budget, for expenses</p>
          <h2 className="max-w-3xl text-title">
            Claims stop at {toDisplay(mandate.maxPerClaim)}. Watch it refuse {REFUSED_AMOUNT}.
          </h2>
          <p className="max-w-2xl text-body-lg text-ink-2">
            Staff photograph a receipt and it is paid from the same budget. Try either claim
            below.
          </p>
        </div>
        <Wire />
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pb-20 sm:px-8 md:pb-28">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">On chain</p>
          <h2 className="max-w-3xl text-title">
            The drawing above is a drawing. These <span className="tnum">{RUN_TALLY.total}</span>{' '}
            are not.
          </h2>
          <p className="max-w-2xl text-body-lg text-ink-2">
            <span className="tnum">{RUN_TALLY.allowed}</span> payments that went through and{' '}
            <span className="tnum">{RUN_TALLY.refused}</span> that were refused. Each one opens
            on a public explorer that has nothing to do with us.
          </p>
        </div>
        <Evidence />
      </section>

      <section className="rounded-t-panel bg-ink text-canvas">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-20 sm:px-8 md:flex-row md:gap-16 md:py-28">
          <div className="flex-1">
            <p className="eyebrow text-canvas/50">The objection</p>
            <blockquote className="mt-6 font-display text-display">
              &ldquo;Your app could just be pretending to block it.&rdquo;
            </blockquote>
          </div>
          <div className="flex max-w-xl flex-1 flex-col gap-5">
            <p className="text-body-lg text-canvas/70">
              Fair. Any check we wrote, we could quietly remove.
            </p>
            <p className="text-body-lg text-canvas/70">
              So the safety test lets you switch off every check this app makes. Only the
              contract is left, and it still refuses with the money untouched. Two of those
              refusals are already public.
            </p>
            <Link href="/safety" className="btn btn--accent mt-2 w-fit">
              Open the safety test
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-20 sm:px-8 md:flex-row md:gap-16 md:py-28">
        <div className="flex max-w-xl flex-1 flex-col gap-5">
          <p className="eyebrow">Why a blockchain</p>
          <h2 className="text-title">The part you should not have to take our word for</h2>
          <p className="text-body text-ink-2">
            Payroll is normally two transfers, and the second one can quietly fail. Here it is
            one. There is no moment where the worker is paid and EPF is not.
          </p>
          <p className="text-body text-ink-2">
            The rules sit on the chain, not in our database. Whoever runs payroll cannot add an
            employee, lower a contribution or move the money. The employer can switch it off at
            any time, and wages already earned can still be withdrawn.
          </p>
        </div>

        <div className="flex-1">
          <p className="eyebrow mb-6">Every check, in this order</p>
          <ol className="flex flex-col">
            {SPEND_CHECKS.map((check) => (
              <li
                key={check.code}
                className="flex items-baseline gap-4 border-b border-rule py-3.5 first:border-t"
              >
                <span className="tnum shrink-0 font-mono text-caption text-accent-ink">
                  {String(check.code).padStart(2, '0')}
                </span>
                <span className="flex-1 text-body text-ink-2">{check.label}</span>
                <span className="hidden shrink-0 font-mono text-label text-ink-3 lg:inline">
                  {check.key}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-caption text-ink-3">
            Checked in this order. A claim that breaks two rules stops at the first one.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8 md:pb-28">
        <p className="mb-6 text-body text-ink-2">
          Have a look around. As the boss:{' '}
          <Link href="/payroll" className="link">run payroll</Link>,{' '}
          <Link href="/approvals" className="link">decide requests</Link>,{' '}
          <Link href="/treasury" className="link">hold the budget</Link>. As staff:{' '}
          <Link href="/earnings" className="link">watch your pay build up</Link>,{' '}
          <Link href="/requests/expense" className="link">claim an expense</Link>,{' '}
          <Link href="/requests/overtime" className="link">an hour worked late</Link>. Or{' '}
          <Link href="/safety" className="link">watch the chain refuse</Link>.
        </p>
        <div className="rounded-panel border border-rule bg-surface p-6 md:p-8">
          <PhoneCode />
        </div>
      </section>

      <footer className="mt-auto border-t border-rule">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-12 text-caption text-ink-3 sm:px-8">
          <p className="max-w-2xl">
            The rules are enforced by published contracts on Sui Testnet, and anyone can check
            them without asking us.
          </p>
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-t border-rule pt-6">
            <p className="max-w-xl">
              Published contract{' '}
              <a href={PACKAGE_LINK} target="_blank" rel="noreferrer" className="link font-mono">
                {PACKAGE_SHORT}
              </a>{' '}
              · {SPEND_CHECKS.length} checks on every payment.
            </p>
            <div className="flex flex-wrap gap-6">
              <a href={PACKAGE_LINK} target="_blank" rel="noreferrer" className="link">
                Package on SuiVision
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
