'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PaymentResult, RuleCheck, SafetyAttackId, SafetyPreviewInput, SafetySimulateResponse } from '@tali/shared';
import { EXPLORER, SAFETY_ATTACKS, subtract, toBaseUnits, toDisplay } from '@tali/shared';
import { taliUsdcDemo } from '@tali/treasury-sui';
import { COMMITTED, MEMBER, STRANGER, mandate } from '@/lib/mock/data';
import { fireAttack, simulateAttack } from '@/lib/mock/api';
import { AttackResult } from './AttackResult';

type Phase = 'armed' | 'firing' | 'result';

type Prediction = SafetySimulateResponse;

const AVAILABLE = subtract(mandate.remainingBudget, COMMITTED);

function defaultsFor(attack: SafetyAttackId): { amount: string; recipient: string; revoked: boolean } {
  if (attack === 'unknown_recipient') return { amount: '3.00', recipient: STRANGER, revoked: false };
  if (attack === 'after_revocation') return { amount: '3.00', recipient: MEMBER, revoked: true };
  if (attack === 'drain_budget') return { amount: toDisplay(AVAILABLE), recipient: MEMBER, revoked: false };
  return { amount: '15.00', recipient: MEMBER, revoked: false };
}

export function SafetyTest() {
  const [attack, setAttack] = useState<SafetyAttackId>('overspend');
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

    const { payment: result, checks: ruleChecks } = await fireAttack(shot);
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
          checks={checks}
          onAgain={() => setPhase('armed')}
          onCounterfactual={() =>
            fire({ amount: toBaseUnits('3.00'), recipient: MEMBER, revokedFirst: false })
          }
        />
        <p className="tnum text-center text-caption text-ink-3">
          This simulation: {tally.fired} run · {tally.blocked} predicted blocked ·{' '}
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

        <dl className="flex flex-col gap-1 rounded-card border border-rule bg-surface p-4 font-mono text-caption">
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
          <span className="text-label uppercase text-ink-3">Reference balance</span>
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
          Preview how the contract rules respond to invalid payments. This page is a simulation:
          it does not sign, broadcast, spend gas, or change the mandate.
        </p>
        <div className="flex flex-wrap gap-3 text-body">
          <a href={EXPLORER.tx(taliUsdcDemo.safetyTest.oversizedClaimTransaction).suiscan} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">
            Real overspend rejection ↗
          </a>
          <a href={EXPLORER.tx(taliUsdcDemo.safetyTest.unapprovedRecipientTransaction).suiscan} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">
            Real recipient rejection ↗
          </a>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-label uppercase text-ink-3">1 · Pick an attack</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {SAFETY_ATTACKS.map((spec) => (
            <button
              key={spec.id}
              type="button"
              onClick={() => choose(spec.id)}
              className={`flex flex-col gap-1 rounded-card border px-4 py-3 text-left transition-colors duration-150 ${
                attack === spec.id
                  ? 'border-accent bg-accent-soft'
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
        <h2 className="text-label uppercase text-ink-3">2 · Set the amount — you choose, we don&rsquo;t</h2>
        <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-4">
          <label className="flex items-baseline gap-3">
            <span className="text-caption text-ink-3">Pay</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="tnum w-40 border-b border-rule bg-transparent pb-1 text-title outline-none focus-visible:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-ink-3">to</span>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full break-all rounded-control border border-rule bg-canvas px-3 py-2 font-mono text-caption outline-none focus-visible:border-accent"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {['5.01', '15.00', toDisplay(AVAILABLE), '1.00'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(preset)}
                className="tnum rounded-control border border-rule px-3 py-1 text-caption transition-colors duration-150 hover:bg-raised"
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
        <h2 className="text-label uppercase text-ink-3">3 · What should happen</h2>
        <div className="rounded-card border border-rule bg-surface p-4">
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
        <div className="flex flex-col gap-2 rounded-card border border-wait-line bg-wait-soft p-4">
          <p className="text-body font-medium text-wait">
            The simulated app check stopped this attempt.
          </p>
          <p className="text-caption text-ink-2">
            A client-side check is only a convenience. Use the evidence links above for the
            corresponding transactions that the deployed contract actually rejected.
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => fire()}
        className="h-14 rounded-card bg-accent text-subhead font-semibold text-surface transition-colors duration-150 hover:bg-accent/90"
      >
        Run simulation — {amount || '0.00'}
      </button>

      <p className="tnum text-center text-caption text-ink-3">
        This simulation: {tally.fired} run · {tally.blocked} predicted blocked ·{' '}
        {toDisplay(tally.attempted)} attempted · 0.00 leaked
        {bypass ? ' · app checks bypassed' : ''}
      </p>
    </div>
  );
}
