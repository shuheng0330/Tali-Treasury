'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PaymentResult, RuleCheck, SafetyAttackId, SafetyPreviewInput, SafetySimulateResponse } from '@tali/shared';
import { EXPLORER, SAFETY_ATTACKS, subtract, toBaseUnits, toDisplay } from '@tali/shared';
import { taliUsdcDemo } from '@tali/treasury-sui';
import { COMMITTED, MEMBER, STRANGER, mandate } from '@/lib/mock/data';
import { fireAttack, simulateAttack } from '@/lib/mock/api';
import { canBroadcast, tryAttack } from '@/lib/api/safety';
import { AttackResult } from './AttackResult';
import { RoleNotice } from '@/components/RoleNotice';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { EMPLOYER_WALLET } from '@/lib/demo-config';
import { ATTACK_COPY, walletAccess } from '@/lib/wallet-access';

type Phase = 'armed' | 'firing' | 'result';

/** Whether the last shot reached Sui, and why not when it did not. */
type Delivery = { broadcast: true } | { broadcast: false; reason: string };

type Prediction = SafetySimulateResponse;

const AVAILABLE = subtract(mandate.remainingBudget, COMMITTED);

function defaultsFor(attack: SafetyAttackId): { amount: string; recipient: string; revoked: boolean } {
  if (attack === 'unknown_recipient') return { amount: '3.00', recipient: STRANGER, revoked: false };
  if (attack === 'after_revocation') return { amount: '3.00', recipient: MEMBER, revoked: true };
  if (attack === 'drain_budget') return { amount: toDisplay(AVAILABLE), recipient: MEMBER, revoked: false };
  return { amount: '15.00', recipient: MEMBER, revoked: false };
}

export function SafetyTest() {
  const { address } = useWalletSession();
  const [attack, setAttack] = useState<SafetyAttackId>('overspend');
  const [delivery, setDelivery] = useState<Delivery>({ broadcast: false, reason: '' });
  const [amount, setAmount] = useState('15.00');
  const [recipient, setRecipient] = useState<string>(MEMBER);
  const [revokedFirst, setRevokedFirst] = useState(false);
  const [bypass, setBypass] = useState(false);

  const [phase, setPhase] = useState<Phase>('armed');
  const [stage, setStage] = useState(0);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [checks, setChecks] = useState<RuleCheck[]>([]);
  const [tally, setTally] = useState({ fired: 0, blocked: 0, attempted: '0' });
  const [appBlocked, setAppBlocked] = useState(false);

  const input: SafetyPreviewInput = { attack, amount: toBaseUnits(amount || '0'), recipient, revokedFirst };

  useEffect(() => {
    if (phase !== 'armed') return;
    let live = true;

    setPrediction(null);
    simulateAttack({ attack, amount: toBaseUnits(amount || '0'), recipient, revokedFirst }).then((result) => {
      if (live) setPrediction(result);
    });

    return () => {
      live = false;
    };
  }, [attack, amount, recipient, revokedFirst, phase]);

  /* Only the attempts that reach Sui need authorising, and the notice explains
     rather than blocks. An unauthorised shot falls back to the local
     prediction and is labelled as one, which is a real outcome worth showing;
     disabling the control would remove the demonstration to prevent a request
     the server already refuses. */
  const broadcasting = canBroadcast(attack);
  const access = walletAccess(address, EMPLOYER_WALLET, ATTACK_COPY);

  const choose = useCallback((next: SafetyAttackId) => {
    setAttack(next);
    if (next === 'custom') return;
    const preset = defaultsFor(next);
    setAmount(preset.amount);
    setRecipient(preset.recipient);
    setRevokedFirst(preset.revoked);
  }, []);

  async function fire(override?: Partial<SafetyPreviewInput>) {
    const shot = { ...input, ...override };

    if (!bypass && override === undefined && prediction?.willFail) {
      setAppBlocked(true);
      return;
    }

    setAppBlocked(false);
    setPhase('firing');
    setStage(0);

    setTimeout(() => setStage(1), 150);
    setTimeout(() => {
      setStage(2);
    }, 320);

    /* The contract's own answer where one can be had. A prediction is only
       ever a fallback, and the result panel is told which it got. */
    const outcome = await tryAttack({
      attack: shot.attack,
      amount: shot.amount,
      recipient: shot.recipient,
    });

    const { payment: predicted, checks: ruleChecks } = await fireAttack(shot);
    const result = outcome.kind === 'broadcast' ? outcome.response.payment : predicted;

    setDelivery(
      outcome.kind === 'broadcast' ? { broadcast: true } : { broadcast: false, reason: outcome.reason },
    );
    setPayment(result);
    setChecks(ruleChecks);
    setTally((current) => ({
      fired: current.fired + 1,
      blocked: current.blocked + (result.ok ? 0 : 1),
      attempted: result.ok
        ? current.attempted
        : (BigInt(current.attempted) + BigInt(shot.amount)).toString(),
    }));
    setPhase('result');
  }

  if (phase === 'result' && payment) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8">
        <AttackResult
          attempted={input.amount}
          payment={payment}
          delivery={delivery}
          checks={checks}
          onAgain={() => setPhase('armed')}
          onCounterfactual={() =>
            fire({ amount: toBaseUnits('3.00'), recipient: MEMBER, revokedFirst: false })
          }
        />
        <p className="tnum text-center text-caption text-ink-3">
          This session: {tally.fired} run · {tally.blocked} refused ·{' '}
          {toDisplay(tally.attempted)} attempted · 0.00 leaked
        </p>
      </div>
    );
  }

  if (phase === 'firing') {
    const steps = ['Prepared', 'Evaluating', 'Rendering'];

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-12">
        <ol className="flex items-center gap-3">
          {steps.map((step, index) => (
            <li key={step} className="flex items-center gap-3">
              <span
                className={`flex items-center gap-2 text-caption ${
                  index <= stage ? 'text-ink' : 'text-ink-3'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    index < stage ? 'bg-ok' : index === stage ? 'animate-breathe bg-accent' : 'bg-rule-strong'
                  }`}
                  aria-hidden
                />
                {step}
              </span>
              {index < steps.length - 1 ? <span className="h-px w-8 bg-rule" aria-hidden /> : null}
            </li>
          ))}
        </ol>

        <dl className="flex flex-col gap-1 rounded-card border border-rule bg-surface p-5 font-mono text-caption">
          <div className="flex gap-3">
            <dt className="w-20 text-ink-3">Recipient</dt>
            <dd className="break-all">{recipient.slice(0, 10)}…</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 text-ink-3">Preview</dt>
            <dd className="break-all">treasury::spend policy model</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 text-ink-3">Network</dt>
            <dd className="break-all">Not submitted</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-4">
          <span className="eyebrow">Reference balance</span>
          <span className="tnum text-title">{toDisplay(AVAILABLE)}</span>
          <span className="text-caption text-ink-3">mock safety dataset · no state change</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Safety test</h1>
        <p className="text-body text-ink-2">
          Send a payment the app would never send, and let the contract answer. Three of the
          five attacks go to Sui when this deployment has a signing key; the other two need the
          mandate revoked or already spent down, which cannot be arranged for one transaction,
          so those stay predictions and say so.
        </p>
        <div className="flex flex-wrap gap-3 text-body">
          <a href={EXPLORER.tx(taliUsdcDemo.safetyTest.oversizedClaimTransaction).suiscan} target="_blank" rel="noreferrer" className="link">
            Real overspend rejection ↗
          </a>
          <a href={EXPLORER.tx(taliUsdcDemo.safetyTest.unapprovedRecipientTransaction).suiscan} target="_blank" rel="noreferrer" className="link">
            Real recipient rejection ↗
          </a>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">1 · Pick an attack</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {SAFETY_ATTACKS.map((spec) => (
            <button
              key={spec.id}
              type="button"
              onClick={() => choose(spec.id)}
              className={`flex flex-col gap-1 rounded-card border px-4 py-3 text-left transition-colors duration-150 ${
                attack === spec.id
                  ? 'border-accent-ink bg-accent-soft'
                  : 'border-rule bg-surface hover:bg-raised'
              }`}
            >
              <span className="text-body font-medium">{spec.label}</span>
              <span className="text-caption text-ink-3">{spec.description}</span>
              <span className="font-mono text-label uppercase text-ink-3">guard · {spec.guard}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">2 · Set the amount — you choose, we don&rsquo;t</h2>
        <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-5">
          <label className="flex items-baseline gap-3">
            <span className="text-caption text-ink-3">Pay</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="tnum w-40 border-b border-rule bg-transparent pb-1 text-title outline-none focus-visible:border-accent-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-ink-3">to</span>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full break-all rounded-control border border-rule bg-canvas px-3 py-2 font-mono text-caption outline-none focus-visible:border-accent-ink"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {['5.01', '15.00', toDisplay(AVAILABLE), '1.00'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(preset)}
                className="btn btn--ghost tnum h-8 px-4 text-caption normal-case tracking-normal"
              >
                {preset}
              </button>
            ))}
          </div>
          <p className="tnum text-caption text-ink-3">
            Per-claim cap is {toDisplay(mandate.maxPerClaim)}. Budget available is{' '}
            {toDisplay(AVAILABLE)}.
          </p>
          <label className="flex items-center gap-2 border-t border-rule pt-3">
            <input
              type="checkbox"
              checked={revokedFirst}
              onChange={(e) => setRevokedFirst(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-caption">Revoke the mandate first</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={bypass}
              onChange={(e) => setBypass(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-caption">
              Ignore the app check in this simulation
            </span>
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">3 · What should happen</h2>
        <div className="rounded-card border border-rule bg-surface p-5">
          {prediction === null ? (
            <p className="text-caption text-ink-3" aria-live="polite">
              Calculating the local preview…
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-body">
                {prediction.willFail
                  ? 'The contract will refuse this.'
                  : 'Every rule passes. The contract will allow this.'}
              </p>
              {prediction.predictedAbortKey ? (
                <p className="font-mono text-caption text-ink-2">
                  {prediction.predictedAbortKey} · {prediction.predictedMessage}
                </p>
              ) : null}
              <p className="pt-1 text-caption text-ink-3">
                Dry run costs no gas and changes nothing. We show you this{' '}
                <em>before</em> the simulated attempt so the expected rule is explicit.
              </p>
            </div>
          )}
        </div>
      </section>

      {appBlocked ? (
        <div className="flex flex-col gap-2 rounded-card border border-wait-line bg-wait-soft p-5">
          <p className="text-body font-medium text-wait">
            The simulated app check stopped this attempt.
          </p>
          <p className="text-caption text-ink-2">
            A client-side check is only a convenience. Use the evidence links above for the
            corresponding transactions that the deployed contract actually rejected.
          </p>
        </div>
      ) : null}

      {broadcasting ? <RoleNotice access={access} /> : null}

      <button
        type="button"
        onClick={() => fire()}
        className="btn btn--accent btn--block h-14"
      >
        {broadcasting ? 'Send it' : 'Predict it'} — {amount || '0.00'}
      </button>

      <p className="tnum text-center text-caption text-ink-3">
        This session: {tally.fired} run · {tally.blocked} refused ·{' '}
        {toDisplay(tally.attempted)} attempted · 0.00 leaked
        {bypass ? ' · app checks bypassed' : ''}
      </p>
    </div>
  );
}
