import Link from 'next/link';
import { EXPLORER, toDisplay } from '@tali/shared';
import { mandate } from '@/lib/mock/data';
import { TALI_TESTNET_PACKAGE_ID } from '@tali/treasury-sui';
import { Evidence } from '@/components/landing/Evidence';
import { PhoneCode } from '@/components/landing/PhoneCode';
import { REFUSED_AMOUNT, Wire } from '@/components/landing/Wire';

const PACKAGE_SHORT = `${TALI_TESTNET_PACKAGE_ID.slice(0, 6)}…${TALI_TESTNET_PACKAGE_ID.slice(-4)}`;
const PACKAGE_LINK = EXPLORER.object(TALI_TESTNET_PACKAGE_ID).suivision;

export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <span className="text-subhead font-semibold">Tali Treasury</span>
          <nav className="flex items-center gap-6">
            <span className="hidden font-mono text-label uppercase text-ink-3 sm:inline">
              sui testnet
            </span>
            <Link
              href="/claim"
              className="text-caption text-ink-2 underline-offset-4 transition-colors duration-150 hover:text-ink hover:underline"
            >
              Open the app
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-16 md:py-24">
        <p className="text-label uppercase text-ink-2">
          Club and event treasury · Sui testnet
        </p>

        <h1 className="max-w-4xl text-display md:text-hero">
          Set the rules once.
          <span className="block text-ink-2">The money enforces them.</span>
        </h1>

        <p className="max-w-2xl text-subhead text-ink-2 md:text-[19px] md:leading-7">
          Your committee photographs receipts, an agent reads them and pays out whatever your
          rules allow, and the limits it works to are held in a Move contract instead of our
          backend — which means the agent cannot spend past them, and neither can we, even by
          accident.
        </p>

        <p className="max-w-2xl text-[16px] leading-6 text-ink-3">
          Today one student holds the club card, fronts everyone&rsquo;s money, and spends the
          next six weeks chasing it back in a WhatsApp group.
        </p>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 pt-2">
          <Link
            href="/safety"
            className="rounded-card bg-accent px-6 py-4 text-[18px] font-semibold text-surface transition-colors duration-150 hover:bg-accent/90"
          >
            Try to break it
          </Link>
          <Link
            href="/claim"
            className="text-[18px] text-ink-2 underline underline-offset-4 transition-colors duration-150 hover:text-ink"
          >
            or submit a claim
          </Link>
        </div>

        <p className="border-t border-rule pt-6 text-[16px] text-ink-3">
          Live on Sui testnet · package{' '}
          <a
            href={PACKAGE_LINK}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-ink-2 underline underline-offset-4"
          >
            {PACKAGE_SHORT}
          </a>{' '}
          · seven checks inside <span className="font-mono">spend()</span> · no real funds
        </p>
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-12 md:py-20">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-heading">
            The cap is {toDisplay(mandate.maxPerClaim)}. Watch it refuse {REFUSED_AMOUNT}.
          </h2>
          <p className="text-caption text-ink-3">Either claim, whenever you like.</p>
        </div>
        <Wire />
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-12 md:py-20">
        <div className="flex flex-col gap-1">
          <h2 className="text-heading">The drawing above is a drawing. These three are not.</h2>
          <p className="text-[16px] text-ink-2">
            Three transactions submitted to Sui testnet against the deployed package. One was
            allowed and two were refused, and every digest below opens in an explorer that has
            nothing to do with us.
          </p>
        </div>
        <Evidence />
      </section>

      <section className="bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12 md:py-20 md:flex-row md:items-start md:gap-12">
          <blockquote className="max-w-sm shrink-0 border-l-2 border-rule-strong pl-6 text-title text-ink-2">
            &ldquo;Your app could just be pretending to block it.&rdquo;
          </blockquote>
          <div className="flex max-w-xl flex-col gap-4">
            <p className="text-body text-ink-2">
              That&rsquo;s the right instinct. A check we wrote is a check we could quietly
              remove.
            </p>
            <p className="text-body text-ink-2">
              So the safety test hands you the amount and the recipient, and gives you a switch
              that skips every check this app performs and sends the transaction raw. Once that
              switch is on, the only thing standing between you and the treasury is the contract
              itself, which refuses the transaction, burns gas refusing it, and leaves the
              balance where it was.
            </p>
            <Link
              href="/safety"
              className="w-fit text-body font-medium text-accent underline underline-offset-4"
            >
              Open the safety test
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12 md:py-20">
        <h2 className="text-heading">Why this needs Move</h2>
        <div className="flex max-w-3xl flex-col gap-4">
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
          <p className="text-body text-ink-3">
            We could not have built the same guarantee in our own backend, because our backend is
            the part you should not have to trust.
          </p>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12 md:py-20">
        <p className="text-[16px] text-ink-2">
          Look around as a{' '}
          <Link href="/claim" className="text-accent underline underline-offset-4">
            member
          </Link>
          , as the{' '}
          <Link href="/treasury" className="text-accent underline underline-offset-4">
            treasurer
          </Link>
          , or go straight to{' '}
          <Link href="/safety" className="text-accent underline underline-offset-4">
            attacking the treasury
          </Link>
          .
        </p>
        <div className="rounded-card border border-rule bg-surface p-6">
          <PhoneCode />
        </div>
      </section>

      <footer className="mt-auto border-t border-rule">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8 text-caption text-ink-3">
          <p className="max-w-2xl">
            The contract and its mandate are live on Sui testnet, and the treasurer view reads
            them straight off the chain rather than from a copy we keep. The claim flow and the
            safety test still run on sample data, and the agent does not yet sign its own
            transactions — that is the piece we are building next. No mainnet, no real funds,
            and nothing here is a custody service.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
            <p>
              Built by Kian Xiang, Shu Heng and Wey Cheng for the MUBA Blockchain Hackathon 2026.
            </p>
            <div className="flex flex-wrap gap-6">
              <a
                href={PACKAGE_LINK}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 transition-colors duration-150 hover:text-ink-2"
              >
                Package on SuiVision
              </a>
              <Link
                href="/system"
                className="underline underline-offset-4 transition-colors duration-150 hover:text-ink-2"
              >
                Design system
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
