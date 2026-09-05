'use client';

import { useMemo, useState } from 'react';
import { useDAppKit } from '@mysten/dapp-kit-react';
import type { ExpenseCategory } from '@tali/shared';
import { EXPLORER, toDisplay } from '@tali/shared';
import {
  buildCreateMandateTransaction,
  CIRCLE_TESTNET_USDC_TYPE,
  SUI_CLOCK_ID,
  TALI_TESTNET_PACKAGE_ID,
} from '@tali/treasury-sui';

import { tryRegisterEvent } from '@/lib/api/event-registration';
import { AGENT_ADDRESS } from '@/lib/demo-config';
import {
  ALL_CATEGORIES,
  CATEGORY_LABEL,
  recipientList,
  registrationRecoveryBlocker,
  treasuryAmounts,
  treasuryProblems,
  type TreasuryFormValue,
} from '@/lib/treasury-setup';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';

/**
 * What happened to the funding transaction.
 *
 * `funded` is deliberately separate from `registered`: once the chain has the
 * money the flow cannot start over, so every later failure keeps the digest and
 * offers the registration retry rather than the button that signs.
 */
type Outcome =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'refused'; message: string }
  | { kind: 'aborted'; digest: string }
  | { kind: 'funded'; digest: string; registering: boolean; reason: string | null }
  | { kind: 'registered'; digest: string; eventId: string };

/**
 * One bordered object per group, with the fields as rows inside it.
 *
 * Every field used to carry its own border on the same fill at the same radius,
 * which made five separate boxes in a column read as a picket fence rather than
 * as three decisions. `Breakdown` already groups rows this way, so this is the
 * house idiom rather than a new one.
 */
function Rows({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-col divide-y divide-rule overflow-hidden rounded-card border border-rule bg-canvas ${className}`}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  problem,
  children,
}: {
  label: string;
  hint?: string;
  problem?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-3">
      <label className="flex flex-col gap-1">
        <span className="text-caption text-ink-2">{label}</span>
        {children}
      </label>
      {problem ? (
        <p className="text-caption text-no" role="alert">
          {problem}
        </p>
      ) : hint ? (
        <p className="text-caption text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * A section that starts closed, for the settings that already have an answer.
 *
 * Expiry, categories and the payer wallet all arrive filled in and almost
 * nobody changes them, but all three were sitting in the middle of the form
 * asking to be read. `disclosure-card` is the app's own summary control, so it
 * carries the 44px target and the +/- affordance the hand-rolled version here
 * was missing. `alert` reopens the fold rather than leaving a validation error
 * hidden behind a closed summary line.
 */
function More({ alert, children }: { alert: boolean; children: React.ReactNode }) {
  return (
    <details className="disclosure-card bg-canvas" open={alert || undefined}>
      <summary>
        More settings
        {alert ? <span className="ml-2 font-normal text-no">something needs fixing</span> : null}
      </summary>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </details>
  );
}

const INPUT = 'bg-transparent text-body outline-none disabled:opacity-60';
const ADDRESS_INPUT = `${INPUT} font-mono text-caption`;

/** A blank field nobody has typed in yet is incomplete, not wrong. */
function ifFilled(problem: string | undefined, raw: string): string | undefined {
  return raw.trim() === '' ? undefined : problem;
}

export function TreasurySetup() {
  const dapp = useDAppKit();
  const { address, connectedAddress, status } = useWalletSession();

  const [form, setForm] = useState<TreasuryFormValue>({
    name: '',
    organisation: '',
    categories: ['food', 'printing', 'transport'],
    budgetUsdc: '20.00',
    maxPerClaimUsdc: '5.00',
    expiryDays: '30',
    recipients: '',
    agent: AGENT_ADDRESS,
  });
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [recoveryDigest, setRecoveryDigest] = useState('');

  const problems = useMemo(() => treasuryProblems(form), [form]);
  const amounts = useMemo(() => {
    if (Object.keys(problems).length > 0) return null;
    try {
      return treasuryAmounts(form);
    } catch {
      return null;
    }
  }, [form, problems]);

  const authenticated = status === 'authenticated' && address !== null;
  const sameAccount = address !== null && address === connectedAddress;

  const blocker = !authenticated
    ? 'Sign in with your wallet first.'
    : !sameAccount
      ? 'Your wallet has switched accounts. Sign in again.'
      : !amounts
        ? 'Some details above still need fixing.'
        : null;

  const recoveryBlocker = registrationRecoveryBlocker({
    digest: recoveryDigest,
    name: form.name,
    organisation: form.organisation,
    categories: form.categories,
    authenticated,
    sameAccount,
  });

  const funded = outcome.kind === 'funded' || outcome.kind === 'registered';

  function toggle(category: ExpenseCategory) {
    setForm((current) => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter((c) => c !== category)
        : [...current.categories, category],
    }));
  }

  async function sign() {
    if (!amounts || !address || blocker) return;
    setOutcome({ kind: 'signing' });

    let digest: string;
    try {
      const transaction = buildCreateMandateTransaction(
        {
          packageId: TALI_TESTNET_PACKAGE_ID,
          coinType: CIRCLE_TESTNET_USDC_TYPE,
          clockId: SUI_CLOCK_ID,
        },
        {
          sender: address,
          agent: form.agent.trim(),
          budget: amounts.budget,
          maxPerClaim: amounts.maxPerClaim,
          expiryMs: amounts.expiryMs,
          approvedRecipients: amounts.approvedRecipients,
        },
      );

      const result = await dapp.signAndExecuteTransaction({ transaction, network: 'testnet' });

      /* A refused contract call resolves here rather than throwing, so the
         success path has to be chosen rather than assumed. */
      if (result.$kind === 'FailedTransaction') {
        setOutcome({ kind: 'aborted', digest: result.FailedTransaction.digest });
        return;
      }
      digest = result.Transaction.digest;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The wallet did not sign.';
      setOutcome({ kind: 'refused', message });
      return;
    }

    await register(digest);
  }

  async function register(digest: string) {
    setOutcome({ kind: 'funded', digest, registering: true, reason: null });
    const result = await tryRegisterEvent({
      digest,
      name: form.name.trim(),
      organisation: form.organisation.trim(),
      allowedCategories: form.categories,
    });
    if (result.kind === 'registered') {
      setOutcome({ kind: 'registered', digest, eventId: result.eventId });
      return;
    }
    setOutcome({
      kind: 'funded',
      digest,
      registering: false,
      reason: result.kind === 'refused' ? result.message : result.reason,
    });
  }

  const advancedProblem = Boolean(
    problems.categories || problems.expiryDays || problems.agent,
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-panel border border-rule bg-surface p-5">
        <h2 className="text-subhead">The event</h2>
        <Rows>
          <Field label="Event name" problem={ifFilled(problems.name, form.name)}>
            <input
              value={form.name}
              disabled={funded}
              placeholder="Orientation Week"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className={INPUT}
            />
          </Field>
          <Field
            label="Organisation"
            problem={ifFilled(problems.organisation, form.organisation)}
          >
            <input
              value={form.organisation}
              disabled={funded}
              placeholder="FSKTM"
              onChange={(event) => setForm({ ...form, organisation: event.target.value })}
              className={INPUT}
            />
          </Field>
        </Rows>
      </section>

      <section className="flex flex-col gap-4 rounded-panel border border-rule bg-surface p-5">
        <h2 className="text-subhead">The money</h2>
        {/* Side by side above 640px: a limit per claim only means something next
            to the amount it is drawn from, and stacked they were a scroll apart
            on a phone. */}
        <Rows className="sm:grid sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <Field
            label="Put in (USDC)"
            problem={ifFilled(problems.budgetUsdc, form.budgetUsdc)}
            hint="Taken from your wallet when you sign."
          >
            <input
              value={form.budgetUsdc}
              inputMode="decimal"
              disabled={funded}
              onChange={(event) => setForm({ ...form, budgetUsdc: event.target.value })}
              className={`${INPUT} tnum text-lead`}
            />
          </Field>
          <Field
            label="Limit per claim (USDC)"
            problem={ifFilled(problems.maxPerClaimUsdc, form.maxPerClaimUsdc)}
            hint="Anything above this is refused."
          >
            <input
              value={form.maxPerClaimUsdc}
              inputMode="decimal"
              disabled={funded}
              onChange={(event) => setForm({ ...form, maxPerClaimUsdc: event.target.value })}
              className={`${INPUT} tnum text-lead`}
            />
          </Field>
        </Rows>
      </section>

      <section className="flex flex-col gap-4 rounded-panel border border-rule bg-surface p-5">
        <h2 className="text-subhead">Who can be paid</h2>
        <Rows>
          <Field
            label="Wallet addresses"
            problem={ifFilled(problems.recipients, form.recipients)}
            hint={`One per line. ${recipientList(form.recipients).length} added so far.`}
          >
            <textarea
              value={form.recipients}
              disabled={funded}
              spellCheck={false}
              rows={3}
              placeholder="0x…"
              onChange={(event) => setForm({ ...form, recipients: event.target.value })}
              className={`${ADDRESS_INPUT} resize-y`}
            />
          </Field>
        </Rows>

        <More alert={advancedProblem}>
          <Rows>
            <Field
              label="Expires in (days)"
              problem={ifFilled(problems.expiryDays, form.expiryDays)}
              hint="After this, nothing more can be paid out."
            >
              <input
                value={form.expiryDays}
                inputMode="numeric"
                disabled={funded}
                onChange={(event) => setForm({ ...form, expiryDays: event.target.value })}
                className={`${INPUT} tnum`}
              />
            </Field>
            <Field
              label="Who pays out approved claims"
              problem={ifFilled(problems.agent, form.agent)}
              hint="Can spend within your rules, never change them."
            >
              <input
                value={form.agent}
                disabled={funded}
                spellCheck={false}
                onChange={(event) => setForm({ ...form, agent: event.target.value })}
                className={ADDRESS_INPUT}
              />
            </Field>
          </Rows>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-caption text-ink-2">Expenses it covers</legend>
            <div className="flex flex-wrap gap-2">
              {ALL_CATEGORIES.map((category) => {
                const on = form.categories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    disabled={funded}
                    aria-pressed={on}
                    onClick={() => toggle(category)}
                    className={`rounded-badge border px-3 py-1.5 text-label uppercase transition-colors ${
                      on
                        ? 'border-accent-line bg-accent-soft text-accent-ink'
                        : 'border-rule bg-canvas text-ink-3 hover:text-ink'
                    }`}
                  >
                    {CATEGORY_LABEL[category]}
                  </button>
                );
              })}
            </div>
            {problems.categories ? (
              <p className="text-caption text-no" role="alert">
                {problems.categories}
              </p>
            ) : (
              <p className="text-caption text-ink-3">Helps sort receipts.</p>
            )}
          </fieldset>
        </More>
      </section>

      {outcome.kind === 'registered' ? (
        <section className="flex flex-col gap-2 rounded-card border border-ok-line bg-ok-soft p-4">
          <p className="text-body font-medium text-ok">The budget is live.</p>
          <p className="break-words text-caption text-ink-2">
            {form.name.trim() || 'Your event'} is funded. Staff can claim against it now.
          </p>
          <a
            className="link self-start text-caption"
            href={EXPLORER.tx(outcome.digest).suiscan}
            target="_blank"
            rel="noreferrer"
          >
            View the funding transaction
          </a>
        </section>
      ) : outcome.kind === 'funded' ? (
        <section className="flex flex-col gap-3 rounded-card border border-wait-line bg-wait-soft p-4">
          <p className="text-body font-medium text-wait">
            {outcome.registering ? 'Paid. Setting it up…' : 'Paid, but not set up yet.'}
          </p>
          <p className="text-caption text-ink-2">
            {outcome.registering
              ? 'Your money has moved. Leave this page open.'
              : `Your money is safe in the budget${
                  outcome.reason ? `, but ${outcome.reason}` : ''
                }. Try again below — do not start over, or you will pay in twice.`}
          </p>
          <a
            className="link self-start text-caption"
            href={EXPLORER.tx(outcome.digest).suiscan}
            target="_blank"
            rel="noreferrer"
          >
            View the payment
          </a>
          {outcome.registering ? null : (
            <button
              type="button"
              onClick={() => void register(outcome.digest)}
              className="btn btn--primary h-9 w-fit px-5 text-label"
            >
              Try again
            </button>
          )}
        </section>
      ) : outcome.kind === 'aborted' ? (
        <section className="flex flex-col gap-2 rounded-card border border-no-line bg-no-soft p-4">
          <p className="text-body font-medium text-no">It was refused.</p>
          <p className="text-caption text-ink-2">
            Nothing was created and no money moved.
          </p>
          <a
            className="link self-start text-caption"
            href={EXPLORER.tx(outcome.digest).suiscan}
            target="_blank"
            rel="noreferrer"
          >
            View the refused transaction
          </a>
        </section>
      ) : outcome.kind === 'refused' ? (
        <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no" role="alert">
          {outcome.message} Nothing was created.
        </p>
      ) : null}

      {funded ? null : (
        <div className="flex flex-col gap-4">
          {amounts ? (
            /* The climax of the screen rather than a sixth field, and the
               sentence that cannot be undone reads before the figures rather
               than under them. */
            <section className="flex flex-col gap-3 rounded-panel border border-accent-line bg-accent-soft p-5">
              <h2 className="text-body font-medium text-accent-ink">
                None of this can be changed afterwards.
              </h2>
              <dl className="flex flex-col divide-y divide-accent-line">
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-body text-ink-2">Money in</dt>
                  <dd className="tnum text-body">
                    {toDisplay(amounts.budget.toString(), 6)}{' '}
                    <span className="text-caption text-ink-3">USDC</span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-body text-ink-2">Limit per claim</dt>
                  <dd className="tnum text-body">
                    {toDisplay(amounts.maxPerClaim.toString(), 6)}{' '}
                    <span className="text-caption text-ink-3">USDC</span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-body text-ink-2">People it can pay</dt>
                  <dd className="tnum text-body">{amounts.approvedRecipients.length}</dd>
                </div>
              </dl>
              <p className="text-caption text-ink-3">On Sui Testnet.</p>
            </section>
          ) : null}

          <button
            type="button"
            onClick={() => void sign()}
            disabled={blocker !== null || outcome.kind === 'signing'}
            className="btn btn--accent btn--block h-12 disabled:cursor-not-allowed"
          >
            {outcome.kind === 'signing' ? 'Check your wallet…' : 'Create and fund the budget'}
          </button>
          {blocker ? <p className="text-caption text-ink-3">{blocker}</p> : null}

          {/* Below the button that creates one, and closed. Above it, an escape
              hatch for a rare failure read as a second way to start. */}
          <details className="disclosure-card">
            <summary>Already paid but it never finished?</summary>
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-caption text-ink-2">
                Paste the transaction ID from your wallet. This only finishes the setup
                — no money moves again.
              </p>
              <Rows>
                <Field label="Transaction ID">
                  <input
                    value={recoveryDigest}
                    spellCheck={false}
                    placeholder="Paste the transaction ID"
                    onChange={(event) => setRecoveryDigest(event.target.value)}
                    className={`${ADDRESS_INPUT} w-full`}
                  />
                </Field>
              </Rows>
              <button
                type="button"
                onClick={() => void register(recoveryDigest.trim())}
                disabled={recoveryBlocker !== null}
                className="btn btn--ghost btn--block h-10 disabled:cursor-not-allowed"
              >
                Finish setting it up
              </button>
              {recoveryBlocker ? (
                <p className="text-caption text-ink-3">{recoveryBlocker}</p>
              ) : null}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
