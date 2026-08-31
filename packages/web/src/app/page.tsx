import Link from 'next/link';
import { EXPLORER, toDisplay } from '@tali/shared';
import { mandate } from '@/lib/mock/data';
import { TALI_TESTNET_PACKAGE_ID } from '@tali/treasury-sui';
import { SPEND_CHECKS } from '@/lib/checks';
import { AFTERMATH, ON_CHAIN_RUNS } from '@/lib/evidence';
import { CheckMarquee } from '@/components/landing/CheckMarquee';
import { Evidence } from '@/components/landing/Evidence';
import { PhoneCode } from '@/components/landing/PhoneCode';
import { REFUSED_AMOUNT, Wire } from '@/components/landing/Wire';

const PACKAGE_SHORT = `${TALI_TESTNET_PACKAGE_ID.slice(0, 6)}…${TALI_TESTNET_PACKAGE_ID.slice(-4)}`;
const PACKAGE_LINK = EXPLORER.object(TALI_TESTNET_PACKAGE_ID).suivision;

const FIGURES = [
  { value: String(SPEND_CHECKS.length), unit: 'checks', note: 'inside spend()' },
  { value: String(ON_CHAIN_RUNS.length), unit: 'transactions', note: 'run on Sui testnet' },
  { value: toDisplay(mandate.maxPerClaim), unit: 'USDC', note: 'per-claim cap' },
  { value: AFTERMATH.gasBurnedByRefusals.split(' ')[0], unit: 'SUI', note: 'burned being refused' },
];

const ROLES = [
  {
    href: '/claim',
    label: 'Member',
    title: 'Photograph a receipt',
    body: 'Snap it, confirm the amount, watch the rules run. No wallet needed to look around.',
  },
  {
    href: '/treasury',
    label: 'Treasurer',
    title: 'Read the mandate',
    body: 'Budget, cap, expiry and allowlist, read off the chain rather than from a copy we keep.',
  },
  {
    href: '/safety',
    label: 'Attacker',
    title: 'Try to break it',
    body: 'Skip every check this app performs and send the transaction raw. See what the contract does.',
  },
];

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
            <Link href="/claim" className="btn btn--primary h-10 px-5">
              Open the app
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 pt-20 pb-16 sm:px-8 md:pt-32 md:pb-24">
        <p className="eyebrow">
          <span aria-hidden className="h-1.5 w-1.5 rounded-badge bg-accent" />
          Club and event treasury
        </p>

        <h1 className="font-display text-hero">
          Set the rules once.
          <span className="block text-accent-ink">The money enforces them.</span>
        </h1>

        <p className="max-w-2xl text-lead text-ink-2">
          One student shouldn&rsquo;t have to front the club&rsquo;s money for six weeks. An
          agent reimburses your members in seconds, and a Move contract — not our backend —
          holds the limits.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/safety" className="btn btn--accent btn--lg">
            Try to break it
          </Link>
          <Link href="/claim" className="btn btn--ghost btn--lg">
            Submit a claim
          </Link>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-rule pt-8 md:grid-cols-4">
          {FIGURES.map((figure) => (
            <div key={figure.note} className="flex flex-col gap-1.5">
              <dt className="eyebrow order-2">{figure.note}</dt>
              <dd className="order-1 flex flex-wrap items-baseline gap-x-1.5 font-display">
                <span className="tnum text-title">{figure.value}</span>
                <span className="text-caption text-ink-3">{figure.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <CheckMarquee />

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-20 sm:px-8 md:py-28">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">The apparatus</p>
          <h2 className="max-w-3xl text-title">
            The cap is {toDisplay(mandate.maxPerClaim)}. Watch it refuse {REFUSED_AMOUNT}.
          </h2>
          <p className="max-w-2xl text-body-lg text-ink-2">
            Either claim, whenever you like. This one is a drawing of the rules — the three
            transactions under it are not.
          </p>
        </div>
        <Wire />
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pb-20 sm:px-8 md:pb-28">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">On chain</p>
          <h2 className="max-w-3xl text-title">
            The drawing above is a drawing. These three are not.
          </h2>
          <p className="max-w-2xl text-body-lg text-ink-2">
            Three transactions submitted to Sui testnet against the deployed package. One was
            allowed and two were refused, and every digest below opens in an explorer that has
            nothing to do with us.
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
              remove.
            </p>
            <p className="text-body-lg text-canvas/70">
              So the safety test hands you the amount and the recipient, and gives you a switch
              that skips every check this app performs and sends the transaction raw. Once that
              switch is on, the only thing standing between you and the treasury is the contract
              itself, which refuses the transaction, burns gas refusing it, and leaves the
              balance where it was.
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
            The mandate is an object, not a row in our database. When a claim is too large,{' '}
            <span className="font-mono">spend()</span> aborts on code 5 before it ever reaches
            the coin, and Move rolls the entire transaction back atomically — so there is no
            state where the check failed but half the transfer went out anyway. That gap is
            where most custody bugs live.
          </p>
          <p className="text-body text-ink-2">
            The agent holds an <span className="font-mono">AgentCap</span>, which lets it call{' '}
            <span className="font-mono">spend()</span> and nothing else. It cannot raise its own
            cap, add a recipient, or move the budget. The treasurer keeps the{' '}
            <span className="font-mono">AdminCap</span> and can revoke in one transaction, after
            which every further call from the agent aborts on code 9.
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

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pb-20 sm:px-8 md:pb-28">
        <p className="eyebrow">Look around</p>
        <div className="grid gap-4 md:grid-cols-3">
          {ROLES.map((role) => (
            <Link
              key={role.href}
              href={role.href}
              className="flood group flex flex-col gap-3 rounded-card border border-rule bg-surface p-6 md:p-8"
            >
              <span className="eyebrow">{role.label}</span>
              <span className="flood-ink font-display text-heading">{role.title}</span>
              <span className="flood-mute text-body">{role.body}</span>
              <span
                aria-hidden
                className="flood-ink mt-4 text-control transition-transform duration-200 ease-pop group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8 md:pb-28">
        <div className="rounded-panel border border-rule bg-surface p-6 md:p-8">
          <PhoneCode />
        </div>
      </section>

      <footer className="mt-auto border-t border-rule">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-12 text-caption text-ink-3 sm:px-8">
          <p className="max-w-2xl">
            The contract and its mandate are live on Sui testnet, and the treasurer view reads
            them straight off the chain rather than from a copy we keep. The claim flow and the
            safety test still run on sample data, and the agent does not yet sign its own
            transactions — that is the piece we are building next. No mainnet, no real funds,
            and nothing here is a custody service.
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
