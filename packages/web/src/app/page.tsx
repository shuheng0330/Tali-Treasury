import Link from 'next/link';
import { EXPLORER, toDisplay } from '@tali/shared';
import { mandate } from '@/lib/mock/data';
import { sampleStaff } from '@/lib/mock/payroll';
import { TALI_TESTNET_PACKAGE_ID } from '@tali/treasury-sui';
import { SPEND_CHECKS } from '@/lib/checks';
import { RUN_TALLY } from '@/lib/evidence';
import { PAYROLL_CONFIGURED, PAYROLL_MANDATE_ID } from '@/lib/demo-config';
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
            <Link href="/payroll/setup" className="btn btn--primary h-10 px-5">
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
          Unpaid statutory contributions are the quietest way a payroll goes wrong: the salary
          lands, the EPF does not, and nobody finds out for months. Tali pays both in one
          transaction, and the contract will not settle one without the other.
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
            month. Four payments have to leave at once.
          </h2>
          <p className="max-w-2xl text-body-lg text-ink-2">
            The wage is scaled down so a whole month of it fits inside a Testnet faucet
            grant. The arithmetic is not scaled: figures follow the EPF Third Schedule bands
            and the RM6,000 SOCSO and EIS ceilings. The mandate holds a minimum for each
            body, measured against the wage — so paying EPF a single sen fails the same
            check as paying it nothing.
          </p>
        </div>

        <PayrollSplit />

        {PAYROLL_MANDATE_ID ? null : (
          <p className="max-w-3xl rounded-card border border-wait-line bg-wait-soft p-4 text-body text-wait">
            <span className="font-medium">Published, not yet funded.</span> The payroll
            module is on chain in package v2 — that upgrade is the last transaction in the
            list below. Nothing has funded a mandate against it yet, so these figures are what
            the contract will enforce, not a run you can look up. The claims contract further
            down is funded, and its refusals are real.
          </p>
        )}

        <p className="max-w-3xl text-body text-ink-2">
          Underpay any one of them and{' '}
          <span className="font-mono">run_payroll</span> aborts on code{' '}
          <span className="tnum">24</span> before a single coin moves. The wage does not go out
          and get corrected later; the whole run reverts.{' '}
          <Link href="/payroll/proof" className="link">
            Take the EPF money and see
          </Link>
          .
        </p>
      </section>

      <CheckMarquee />

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-20 sm:px-8 md:py-28">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">The same mandate, for expenses</p>
          <h2 className="max-w-3xl text-title">
            Reimbursements answer to a cap of {toDisplay(mandate.maxPerClaim)}. Watch it refuse{' '}
            {REFUSED_AMOUNT}.
          </h2>
          <p className="max-w-2xl text-body-lg text-ink-2">
            Staff claim expenses against the same treasury, and an agent reads the receipt and
            pays it. Either claim below, whenever you like. This one is a drawing of the rules —
            the <span className="tnum">{RUN_TALLY.total}</span> transactions under it are not.
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
            <span className="tnum">{RUN_TALLY.total}</span> transactions submitted to Sui
            testnet against the deployed package:{' '}
            <span className="tnum">{RUN_TALLY.allowed}</span> payments the mandate allowed,{' '}
            <span className="tnum">{RUN_TALLY.refused}</span> it refused, and the upgrade that
            published payroll. Every digest below opens in an explorer that has nothing to do
            with us.
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
              That&rsquo;s the right instinct. A check we wrote is a check we could quietly
              remove, so the only claim worth making is about the contract.
            </p>
            <p className="text-body-lg text-canvas/70">
              The safety test hands you the amount and the recipient, and a switch that skips
              every check this app performs. With it on, the only thing between you and the
              treasury is the contract — which refuses, spends gas refusing, and leaves the
              balance where it was. Two of those refusals are already on chain and linked from
              the page, with digests that open in an explorer that has nothing to do with us.
            </p>
            <Link href="/safety" className="btn btn--accent mt-2 w-fit">
              Open the safety test
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-20 sm:px-8 md:flex-row md:gap-16 md:py-28">
        <div className="flex max-w-xl flex-1 flex-col gap-5">
          <p className="eyebrow">Why this needs Move</p>
          <h2 className="text-title">The backend is the part you should not have to trust</h2>
          <p className="text-body text-ink-2">
            A payroll run that pays the wage and then fails to pay EPF is the ordinary failure,
            and it is a failure of ordering: two transfers, one succeeded. In Move there is one
            transaction. If the EPF amount is below the mandate&rsquo;s floor,{' '}
            <span className="font-mono">run_payroll</span> aborts on code{' '}
            <span className="tnum">24</span> before any coin is split, and the whole thing rolls
            back atomically — so no state exists where the worker was paid and the statutory
            bodies were not.
          </p>
          <p className="text-body text-ink-2">
            The mandate is an object, not a row in our database. It names the staff it may pay
            and the minimum each body must receive, and the agent holding the capability cannot
            change either — it cannot add itself as an employee, lower a floor, or move the
            budget. The employer can revoke in one transaction, after which new runs abort while
            wages already earned can still be withdrawn.
          </p>
        </div>

        <div className="flex-1">
          <p className="eyebrow mb-6">Every call, in this order</p>
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
            Numbered by abort code, listed in evaluation order. A claim that breaks two rules
            stops at whichever comes first.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8 md:pb-28">
        <p className="mb-6 text-body text-ink-2">
          Look around as the <Link href="/payroll" className="link">employer</Link>, as{' '}
          <Link href="/earnings" className="link">someone being paid</Link>, as a{' '}
          <Link href="/claim" className="link">member claiming an expense</Link>, as the{' '}
          <Link href="/treasury" className="link">treasurer</Link>, set up{' '}
          <Link href="/treasury/setup" className="link">an expense treasury</Link>, or in the{' '}
          <Link href="/safety" className="link">safety test</Link>.
        </p>
        <div className="rounded-panel border border-rule bg-surface p-6 md:p-8">
          <PhoneCode />
        </div>
      </section>

      <footer className="mt-auto border-t border-rule">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-12 text-caption text-ink-3 sm:px-8">
          <p className="max-w-2xl">
            The claims contract and its mandate are live on Sui testnet, and the treasurer view
            reads them straight off the chain rather than from a copy we keep.{' '}
            {PAYROLL_CONFIGURED
              ? 'The payroll module is published, and its mandate and salary stream are read from the chain.'
              : PAYROLL_MANDATE_ID
                ? 'The payroll module is published and its mandate is read from the chain, but no salary stream has been opened against it yet.'
                : 'The payroll module is published in package v2, but no mandate has been funded from it yet, so payroll screens compute the split the contract will enforce and say so on every screen.'}{' '}
            Receipt submission and server policy
            processing are connected when demo identity is enabled; review, safety controls, and
            payment are not yet signed transactions. No mainnet, no real funds, and nothing here
            is a custody service.
          </p>
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-t border-rule pt-6">
            <p className="max-w-xl">
              Package{' '}
              <a href={PACKAGE_LINK} target="_blank" rel="noreferrer" className="link font-mono">
                {PACKAGE_SHORT}
              </a>{' '}
              · {SPEND_CHECKS.length} checks inside <span className="font-mono">spend()</span>.
              Built by Kian Xiang, Shu Heng and Wey Cheng for the MUBA Blockchain Hackathon 2026.
            </p>
            <div className="flex flex-wrap gap-6">
              <a href={PACKAGE_LINK} target="_blank" rel="noreferrer" className="link">
                Package on SuiVision
              </a>
              <Link href="/system" className="link">
                Design system
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
