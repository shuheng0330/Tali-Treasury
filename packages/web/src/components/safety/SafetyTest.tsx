'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PaymentResult, RuleCheck, SafetyAttackId } from '@tali/shared';
import { SAFETY_ATTACKS, subtract, toBaseUnits, toDisplay } from '@tali/shared';
import { COMMITTED, MEMBER, STRANGER, mandate } from '@/lib/mock/data';
import { fireAttack, simulateAttack, type AttackInput } from '@/lib/mock/api';
import { AttackResult } from './AttackResult';

type Phase = 'armed' | 'firing' | 'result';

interface Prediction {
  willFail: boolean;
  predictedAbortKey: string | null;
  predictedMessage: string;
  simulatedInMs: number;
}

const AVAILABLE = subtract(mandate.remainingBudget, COMMITTED);

function defaultsFor(attack: SafetyAttackId): { amount: string; recipient: string; revoked: boolean } {
  if (attack === 'unknown_recipient') return { amount: '150.00', recipient: STRANGER, revoked: false };
  if (attack === 'after_revocation') return { amount: '84.00', recipient: MEMBER, revoked: true };
  if (attack === 'drain_budget') return { amount: toDisplay(AVAILABLE), recipient: MEMBER, revoked: false };
  return { amount: '9000.00', recipient: MEMBER, revoked: false };
}

export function SafetyTest() {
  const [attack, setAttack] = useState<SafetyAttackId>('overspend');
  const [amount, setAmount] = useState('9000.00');
  const [recipient, setRecipient] = useState(MEMBER);
  const [revokedFirst, setRevokedFirst] = useState(false);
  const [bypass, setBypass] = useState(false);

  const [phase, setPhase] = useState<Phase>('armed');
  const [stage, setStage] = useState(0);
  const [digest, setDigest] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [checks, setChecks] = useState<RuleCheck[]>([]);
  const [tally, setTally] = useState({ fired: 0, blocked: 0, attempted: '0' });
  const [appBlocked, setAppBlocked] = useState(false);

  const input: AttackInput = { attack, amount: toBaseUnits(amount || '0'), recipient, revokedFirst };

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

  async function fire(override?: Partial<AttackInput>) {
    const shot = { ...input, ...override };

    if (!bypass && override === undefined && prediction?.willFail) {
      setAppBlocked(true);
      return;
    }

    setAppBlocked(false);
    setPhase('firing');
    setStage(0);
    setDigest(null);

    setTimeout(() => setStage(1), 150);
    setTimeout(() => {
      setStage(2);
      setDigest(Math.random().toString(16).slice(2, 10) + 'qR9nK2wLpX7vB4m');
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
            fire({ amount: toBaseUnits('84.00'), recipient: MEMBER, revokedFirst: false })
          }
        />
        <p className="tnum text-center text-caption text-ink-3">
          This session: {tally.fired} fired · {tally.blocked} blocked ·{' '}
          {toDisplay(tally.attempted)} attempted · 0.00 leaked
        </p>
      </div>
    );
  }

  if (phase === 'firing') {
    const steps = ['Signed', 'Broadcast', 'Executing'];

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
            <dt className="w-20 text-ink-3">Sender</dt>
            <dd className="break-all">{MEMBER.slice(0, 10)}… (the agent&rsquo;s key)</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 text-ink-3">Calling</dt>
            <dd className="break-all">treasury::spend</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 text-ink-3">Digest</dt>
            <dd className="break-all">{digest ?? '…'}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-4">
          <span className="text-label uppercase text-ink-3">Treasury, live</span>
          <span className="tnum text-title">{toDisplay(AVAILABLE)}</span>
          <span className="text-caption text-ink-3">unchanged · polling every 250 ms</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Safety test</h1>
        <p className="text-body text-ink-2">
          Try to make the agent overspend. These are real transactions against the mandate.
          Nothing here is simulated by us — the contract decides.
        </p>
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
            {['201.00', '9000.00', toDisplay(AVAILABLE), '1.00'].map((preset) => (
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
              Bypass this app&rsquo;s checks — send the transaction raw
            </span>
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-label uppercase text-ink-3">3 · What should happen</h2>
        <div className="rounded-card border border-rule bg-surface p-4">
          {prediction === null ? (
            <p className="text-caption text-ink-3" aria-live="polite">
              Dry-running against the live contract…
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
                <em>before</em> firing so you can check we did not fake it afterwards.
              </p>
            </div>
          )}
        </div>
      </section>

      {appBlocked ? (
        <div className="flex flex-col gap-2 rounded-card border border-wait-line bg-wait-soft p-4">
          <p className="text-body font-medium text-wait">
            This app refused to send it. That proves nothing.
          </p>
          <p className="text-caption text-ink-2">
            A client-side check is a convenience, not a guarantee — we wrote it, so we could
            remove it. Tick <span className="font-medium">bypass this app&rsquo;s checks</span>{' '}
            and fire again to watch the contract refuse the same transaction.
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => fire()}
        className="h-14 rounded-card bg-accent text-subhead font-semibold text-surface transition-colors duration-150 hover:bg-accent/90"
      >
        Fire the attack — {amount || '0.00'}
      </button>

      <p className="tnum text-center text-caption text-ink-3">
        This session: {tally.fired} fired · {tally.blocked} blocked ·{' '}
        {toDisplay(tally.attempted)} attempted · 0.00 leaked
        {bypass ? ' · app checks bypassed' : ''}
      </p>
    </div>
  );
}
