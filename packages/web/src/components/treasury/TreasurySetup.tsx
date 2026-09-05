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
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 rounded-control border border-rule bg-surface px-3 py-2">
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
    ? 'Sign in with the treasurer wallet first.'
    : !sameAccount
      ? 'The connected wallet is not the one this session was signed with.'
      : !amounts
        ? 'Some of the details above still need fixing.'
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

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">What this treasury is for</h2>
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
                      : 'border-rule bg-surface text-ink-3 hover:text-ink'
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
            <p className="text-caption text-ink-3">
              Metadata for review, not a contract rule. The chain enforces the cap and the
              allowlist; categories decide what the agent will read a receipt as.
            </p>
          )}
        </fieldset>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">What it may spend</h2>
        <Field
          label="Fund the mandate with (USDC)"
          problem={ifFilled(problems.budgetUsdc, form.budgetUsdc)}
          hint="Taken from your wallet when you sign. Claims in ringgit are quoted into this at approval."
        >
          <input
            value={form.budgetUsdc}
            inputMode="decimal"
            disabled={funded}
            onChange={(event) => setForm({ ...form, budgetUsdc: event.target.value })}
            className={`${INPUT} tnum text-title`}
          />
        </Field>
        <Field
          label="Most one claim may spend (USDC)"
          problem={ifFilled(problems.maxPerClaimUsdc, form.maxPerClaimUsdc)}
          hint="The contract refuses anything above this, whoever asks."
        >
          <input
            value={form.maxPerClaimUsdc}
            inputMode="decimal"
            disabled={funded}
            onChange={(event) => setForm({ ...form, maxPerClaimUsdc: event.target.value })}
            className={`${INPUT} tnum`}
          />
        </Field>
        <Field
          label="Expires in (days)"
          problem={ifFilled(problems.expiryDays, form.expiryDays)}
          hint="After this nothing more can be paid, whatever is left in it."
        >
          <input
            value={form.expiryDays}
            inputMode="numeric"
            disabled={funded}
            onChange={(event) => setForm({ ...form, expiryDays: event.target.value })}
            className={`${INPUT} tnum`}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">Who it may pay</h2>
        <Field
          label="Approved recipients"
          problem={ifFilled(problems.recipients, form.recipients)}
          hint={`One Sui address per line. ${recipientList(form.recipients).length} listed.`}
        >
          <textarea
            value={form.recipients}
            disabled={funded}
            spellCheck={false}
            rows={4}
            placeholder="0x…"
            onChange={(event) => setForm({ ...form, recipients: event.target.value })}
            className={`${ADDRESS_INPUT} resize-y`}
          />
        </Field>
        <Field
          label="Backend signer"
          problem={ifFilled(problems.agent, form.agent)}
          hint="Receives the AgentCap and pays approved claims. You keep the AdminCap, so it can spend within the rules but never change them."
        >
          <input
            value={form.agent}
            disabled={funded}
            spellCheck={false}
            onChange={(event) => setForm({ ...form, agent: event.target.value })}
            className={ADDRESS_INPUT}
          />
        </Field>
      </section>

      {amounts ? (
        <section className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-4">
          <h2 className="eyebrow">What you are about to sign</h2>
          <dl className="flex flex-col gap-2 text-body">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">Network</dt>
              <dd>Sui Testnet</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">Funding</dt>
              <dd className="tnum">{toDisplay(amounts.budget.toString(), 6)} USDC</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">Cap per claim</dt>
              <dd className="tnum">{toDisplay(amounts.maxPerClaim.toString(), 6)} USDC</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">Recipients</dt>
              <dd className="tnum">{amounts.approvedRecipients.length}</dd>
            </div>
          </dl>
          <p className="text-caption text-ink-3">
            The cap, the expiry and the allowlist are fixed at creation and cannot be
            edited afterwards. Gas comes from your wallet as well as the funding.
          </p>
        </section>
      ) : null}

      {outcome.kind === 'registered' ? (
        <section className="flex flex-col gap-2 rounded-card border border-ok-line bg-ok-soft p-4">
          <p className="text-body font-medium text-ok">The treasury is live.</p>
          <p className="text-caption text-ink-2">
            Event <span className="font-mono">{outcome.eventId}</span> is funded and
            registered. Members can claim against it now.
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
            {outcome.registering
              ? 'Funded on chain. Registering it…'
              : 'Funded on chain, but not registered.'}
          </p>
          <p className="text-caption text-ink-2">
            {outcome.registering
              ? 'The money has moved. Leave this open.'
              : `The mandate exists and holds your USDC${
                  outcome.reason ? `, but ${outcome.reason}` : ''
                }. Retry the registration — do not create the treasury again, which would fund a second mandate.`}
          </p>
          <a
            className="link self-start text-caption"
            href={EXPLORER.tx(outcome.digest).suiscan}
            target="_blank"
            rel="noreferrer"
          >
            View the funding transaction
          </a>
          {outcome.registering ? null : (
            <button
              type="button"
              onClick={() => void register(outcome.digest)}
              className="btn btn--primary h-9 w-fit px-5 text-label"
            >
              Retry registration
            </button>
          )}
        </section>
      ) : outcome.kind === 'aborted' ? (
        <section className="flex flex-col gap-2 rounded-card border border-no-line bg-no-soft p-4">
          <p className="text-body font-medium text-no">The contract refused it.</p>
          <p className="text-caption text-ink-2">
            No treasury was created and nothing was funded. Gas was still spent.
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

      {!funded ? (
        <section className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-4">
          <div className="flex flex-col gap-1">
            <h2 className="eyebrow">Already funded? Recover registration</h2>
            <p className="text-caption text-ink-2">
              Paste the funding transaction digest from your wallet or SuiScan. This only
              registers the existing mandate; it never moves funds again.
            </p>
          </div>
          <Field
            label="Funding transaction digest"
            hint="Open the wallet’s recent activity and copy the digest for the successful funding transaction."
          >
            <input
              value={recoveryDigest}
              spellCheck={false}
              placeholder="e.g. 9gY…"
              onChange={(event) => setRecoveryDigest(event.target.value)}
              className={`${ADDRESS_INPUT} w-full`}
            />
          </Field>
          <button
            type="button"
            onClick={() => void register(recoveryDigest.trim())}
            disabled={recoveryBlocker !== null}
            className="btn btn--ghost btn--block h-10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Recover and register funded treasury
          </button>
          {recoveryBlocker ? <p className="text-caption text-ink-3">{recoveryBlocker}</p> : null}
        </section>
      ) : null}

      {funded ? null : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void sign()}
            disabled={blocker !== null || outcome.kind === 'signing'}
            className="btn btn--primary btn--block h-12 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {outcome.kind === 'signing'
              ? 'Waiting for your wallet…'
              : 'Create and fund the treasury'}
          </button>
          {blocker ? <p className="text-caption text-ink-3">{blocker}</p> : null}
        </div>
      )}
    </div>
  );
}
