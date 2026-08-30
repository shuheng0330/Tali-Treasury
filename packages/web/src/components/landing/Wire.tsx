'use client';

import { useCallback, useEffect, useState } from 'react';
import { compare, toBaseUnits, toDisplay } from '@tali/shared';
import { mandate } from '@/lib/mock/data';

/** The contract compares against the mandate's own balance. It has no notion of
 *  the claims we have committed but not yet settled, so neither does this. */
const BUDGET = mandate.remainingBudget;
const CAP = mandate.maxPerClaim;

interface Run {
  id: string;
  merchant: string;
  short: string;
  who: string;
  amount: string;
}

/** The refused claim runs first: it is the only one that demonstrates anything. */
const RUNS: Run[] = [
  {
    id: 'q-0148',
    merchant: 'Campus Print Shop',
    short: 'Print Shop',
    who: 'Wey Cheng',
    amount: '340.00',
  },
  {
    id: 'c-0142',
    merchant: 'Restoran Nasi Kandar Line Clear',
    short: 'Line Clear',
    who: 'Kian Xiang',
    amount: '84.00',
  },
];

interface Gate {
  key: string;
  label: string;
  code: number;
  detail: (base: string) => string;
}

/** These four are a subset of the seven asserts in treasury::spend, kept in the
 *  order the contract evaluates them. The three omitted here — wrong agent cap
 *  (3), zero amount (4) and expiry (8) — cannot be triggered from this panel. */
const GATES: Gate[] = [
  { key: 'mandate_active', label: 'The mandate is live', code: 9, detail: () => 'not revoked' },
  {
    key: 'per_claim_max',
    label: 'Under the per-claim cap',
    code: 5,
    detail: (base) => `${toDisplay(base)} vs ${toDisplay(CAP)}`,
  },
  {
    key: 'total_budget',
    label: 'Inside the remaining budget',
    code: 6,
    detail: (base) => `${toDisplay(base)} of ${toDisplay(BUDGET)}`,
  },
  {
    key: 'recipient_allowlist',
    label: 'Recipient is on the list',
    code: 7,
    detail: () => 'added by the treasurer',
  },
];

const GATE_X = [16, 38, 60, 82];
const END_X = 97;

function firstFailure(base: string): number | null {
  if (compare(base, CAP) > 0) return 1;
  if (compare(base, BUDGET) > 0) return 2;
  return null;
}

type GateState = 'pending' | 'passed' | 'failed' | 'skipped';

function Mark({ state }: { state: GateState }) {
  if (state === 'passed') {
    return (
      <svg viewBox="0 0 12 12" width="12" height="12" className="shrink-0 text-ok" aria-hidden>
        <path
          d="M2 6.4 L4.8 9 L10 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (state === 'failed') {
    return (
      <svg viewBox="0 0 12 12" width="12" height="12" className="shrink-0 text-no" aria-hidden>
        <path d="M6 1.5 11 10.5 1 10.5 Z" fill="currentColor" />
      </svg>
    );
  }

  if (state === 'skipped') {
    return (
      <svg viewBox="0 0 12 12" width="12" height="12" className="shrink-0 text-dead" aria-hidden>
        <path d="M2.5 6 H9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 12 12" width="12" height="12" className="shrink-0 text-ink-3" aria-hidden>
      <circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function Wire() {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState(-1);
  const [playing, setPlaying] = useState(true);

  const run = RUNS[index];
  const base = toBaseUnits(run.amount);
  const failAt = firstFailure(base);
  const finalStage = failAt ?? GATES.length;
  const settled = stage >= finalStage;
  const blocked = failAt !== null;

  useEffect(() => {
    if (!playing) return;

    if (stage < finalStage) {
      const timer = setTimeout(() => setStage((current) => current + 1), stage < 0 ? 420 : 600);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(
      () => {
        setIndex((current) => (current + 1) % RUNS.length);
        setStage(-1);
      },
      blocked ? 4000 : 2400,
    );
    return () => clearTimeout(timer);
  }, [stage, finalStage, playing, blocked]);

  const select = useCallback((next: number) => {
    setIndex(next);
    setStage(-1);
    setPlaying(true);
  }, []);

  function gateState(i: number): GateState {
    if (failAt !== null && i === failAt) return stage >= i ? 'failed' : 'pending';
    if (failAt !== null && i > failAt) return stage >= failAt ? 'skipped' : 'pending';
    return stage >= i ? 'passed' : 'pending';
  }

  const x = stage < 0 ? 1.5 : stage < GATES.length ? GATE_X[stage] : END_X;
  const verdict = blocked
    ? `Over the ${toDisplay(CAP)} cap. Nothing moved.`
    : 'Allowed. All four rules passed.';

  return (
    <div className="flex flex-col rounded-card border border-rule bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full bg-ink-3 ${settled ? '' : 'animate-breathe'}`}
            aria-hidden
          />
          <span className="text-label uppercase text-ink-3">Orientation Week mandate</span>
        </span>
        <span className="text-caption font-medium text-wait">
          Illustration — not a live transaction
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-5 sm:px-5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-label uppercase text-ink-3">Claim {run.id}</span>
          <span className="truncate text-heading">{run.merchant}</span>
          <span className="text-caption text-ink-3">submitted by {run.who}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span
            className={`tnum text-display leading-none ${
              blocked && settled ? 'text-ink-3 line-through' : ''
            }`}
          >
            {toDisplay(base)}
          </span>
          <span className="text-caption text-ink-3">SUI</span>
        </span>
      </div>

      <div className="px-4 pb-7 pt-8 sm:px-5">
        <div className="relative h-6">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule" aria-hidden />
          <span
            className={`absolute left-0 top-1/2 h-px -translate-y-1/2 transition-[width] duration-500 ease-pop ${
              blocked && settled ? 'bg-no' : 'bg-accent'
            }`}
            style={{ width: `${x}%` }}
            aria-hidden
          />

          {GATES.map((gate, i) => {
            const state = gateState(i);
            return (
              <span
                key={gate.key}
                className="absolute top-1/2 block -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${GATE_X[i]}%` }}
                aria-hidden
              >
                <span
                  className={`block w-[3px] rounded-badge transition-all duration-300 ${
                    state === 'failed'
                      ? 'h-6 bg-no'
                      : state === 'passed'
                        ? 'h-3.5 bg-accent'
                        : state === 'skipped'
                          ? 'h-3.5 bg-rule'
                          : 'h-3.5 bg-rule-strong'
                  }`}
                />
                <span className="tnum absolute left-1/2 top-full mt-2 block -translate-x-1/2 text-label text-ink-3">
                  {i + 1}
                </span>
              </span>
            );
          })}

          <span
            className="absolute top-1/2 block -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${END_X}%` }}
            aria-hidden
          >
            <span
              className={`block h-6 w-6 rounded-full border transition-colors duration-300 ${
                settled && !blocked ? 'border-ok bg-ok-soft' : 'border-rule-strong bg-canvas'
              }`}
            />
          </span>

          <span
            className="absolute top-1/2 block -translate-x-1/2 -translate-y-1/2 transition-[left] duration-500 ease-pop"
            style={{ left: `${x}%` }}
            aria-hidden
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full transition-colors duration-300 ${
                blocked && settled
                  ? 'bg-no ring-4 ring-no-soft'
                  : settled
                    ? 'bg-ok'
                    : 'bg-accent ring-4 ring-accent-soft'
              }`}
            />
          </span>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-rule border-t border-rule">
        {GATES.map((gate, i) => {
          const state = gateState(i);
          return (
            <li
              key={gate.key}
              className={`flex items-center gap-3 px-4 py-2 transition-colors duration-300 sm:px-5 ${
                state === 'failed' ? 'bg-no-soft' : ''
              }`}
            >
              <span className="tnum w-3 shrink-0 text-label text-ink-3">{i + 1}</span>
              <Mark state={state} />
              <span
                className={`min-w-0 flex-1 truncate text-caption ${
                  state === 'failed'
                    ? 'font-medium text-no'
                    : state === 'skipped'
                      ? 'text-ink-3'
                      : 'text-ink-2'
                }`}
              >
                {gate.label}
              </span>
              <span
                className={`shrink-0 pl-3 text-right font-mono text-caption text-ink-3 ${
                  state === 'skipped' ? '' : 'tnum'
                }`}
              >
                {state === 'skipped' ? 'never reached' : gate.detail(base)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1 border-t border-rule px-4 py-4 sm:px-5">
        {!settled ? (
          <span className="text-subhead text-ink-3">Checking against the mandate…</span>
        ) : (
          <>
            <span className={`text-title ${blocked ? 'text-no' : 'text-ok'}`}>{verdict}</span>
            <span className="text-caption text-ink-2">
              {blocked
                ? `The contract would abort on code ${GATES[failAt].code} and roll the whole transaction back. Rules 3 and 4 never run.`
                : 'Every rule the contract checks was satisfied, so the transfer goes through in one transaction.'}
            </span>
          </>
        )}
      </div>

      <span className="sr-only" aria-live="polite">
        {settled ? `${run.merchant}, ${toDisplay(base)}. ${verdict}` : ''}
      </span>

      <div className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-3 sm:px-5">
        <span className="mr-1 text-label uppercase text-ink-3">Queue</span>
        {RUNS.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => select(i)}
            aria-current={i === index ? 'true' : undefined}
            className={`tnum rounded-control border px-2.5 py-1 text-caption transition-colors duration-150 ${
              i === index
                ? 'border-accent-line bg-accent-soft text-ink'
                : 'border-rule text-ink-3 hover:bg-raised hover:text-ink-2'
            }`}
          >
            {item.short} · {item.amount}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          className="ml-auto rounded-control border border-rule px-2.5 py-1 text-caption text-ink-3 transition-colors duration-150 hover:bg-raised hover:text-ink-2"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>

      <p className="border-t border-rule px-4 py-3 text-caption text-ink-3 sm:px-5">
        Four of the seven checks inside <span className="font-mono">spend()</span>. The other
        three cover the agent&rsquo;s key, a zero amount and the expiry date. Amounts are in the
        mandate&rsquo;s coin — SUI on testnet, standing in for a ringgit stablecoin.
      </p>
    </div>
  );
}
