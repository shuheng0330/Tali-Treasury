'use client';

import { useEffect, useState } from 'react';
import type { PolicyDecision } from '@tali/shared';

const STEP_MS = 180;

function Mark({ state }: { state: 'pending' | 'pass' | 'fail' }) {
  if (state === 'pending') {
    return <span className="h-2 w-2 rounded-full bg-rule-strong" aria-hidden />;
  }

  if (state === 'pass') {
    return (
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden className="text-ok">
        <path d="M2 6.4 L4.8 9 L10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden className="text-no">
      <path d="M3 3 L9 9 M9 3 L3 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function RuleCheck({
  decision,
  onSettled,
}: {
  decision: PolicyDecision;
  onSettled: () => void;
}) {
  const [revealed, setRevealed] = useState(0);
  const total = decision.checks.length;

  useEffect(() => {
    if (revealed >= total) {
      const done = setTimeout(onSettled, 700);
      return () => clearTimeout(done);
    }

    const next = setTimeout(() => setRevealed((n) => n + 1), STEP_MS);
    return () => clearTimeout(next);
  }, [revealed, total, onSettled]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-heading">Checking the rules</h1>
        <p className="text-caption text-ink-3">
          The mandate decides, not the app. Five of these are enforced on Sui.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-card border border-rule bg-surface">
        {decision.checks.map((check, index) => {
          const state = index >= revealed ? 'pending' : check.passed ? 'pass' : 'fail';

          return (
            <li
              key={check.rule}
              className={`flex items-start gap-3 px-4 py-3 transition-opacity duration-200 ease-pop ${
                state === 'pending' ? 'opacity-35' : 'opacity-100'
              }`}
            >
              <span className="flex h-5 w-3 items-center justify-center">
                <Mark state={state} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`text-body ${state === 'fail' ? 'text-no' : ''}`}>{check.label}</span>
                <span className="tnum text-caption text-ink-3">{check.detail}</span>
              </span>
              {check.onChain ? (
                <span className="mt-0.5 shrink-0 rounded-badge bg-raised px-2 py-1 font-mono text-label uppercase text-ink-3">on-chain</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
