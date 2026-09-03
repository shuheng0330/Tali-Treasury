'use client';

import { useState } from 'react';

export interface AnnotatedCheck {
  rule: string;
  label: string;
  detail: string;
  passed: boolean;
  notEvaluated: boolean;
}

export function Verdict({ passed, pending }: { passed: boolean; pending?: boolean }) {
  if (pending) {
    return (
      <svg viewBox="0 0 12 12" width="11" height="11" className="text-ink-3" aria-hidden>
        <path d="M2.5 6 H9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return passed ? (
    <svg viewBox="0 0 12 12" width="11" height="11" className="text-ok" aria-hidden>
      <path d="M2 6.4 L4.8 9 L10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 12 12" width="11" height="11" className="text-no" aria-hidden>
      <path d="M3 3 L9 9 M9 3 L3 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckLine({ check }: { check: AnnotatedCheck }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="translate-y-0.5">
        <Verdict passed={check.passed} pending={check.notEvaluated} />
      </span>
      <span
        className={`text-caption ${
          check.notEvaluated ? 'text-ink-3' : check.passed ? 'text-ink-2' : 'font-medium text-no'
        }`}
      >
        {check.label}
      </span>
      <span className="tnum ml-auto text-right text-caption text-ink-3">{check.detail}</span>
    </li>
  );
}

/**
 * A claim carries eight policy checks, and showing every one of them for
 * every claim in the queue is what made the review list unreadable — a
 * treasurer scanning four claims had to wade through thirty-two lines to find
 * the one check actually stopping each of them.
 *
 * What needs attention (failing or not yet evaluated) is what's shown by
 * default. A claim that passes everything collapses to one line. Nothing is
 * hidden permanently — the full breakdown a treasurer would want before
 * approving is one click away — but it stops being the default view.
 */
export function ChecklistSummary({ checks }: { checks: AnnotatedCheck[] }) {
  const [expanded, setExpanded] = useState(false);
  const attention = checks.filter((check) => check.notEvaluated || !check.passed);
  const passedCount = checks.length - attention.length;

  if (expanded) {
    return (
      <div className="flex flex-col gap-2">
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {checks.map((check) => (
            <CheckLine key={check.rule} check={check} />
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="self-start text-caption text-ink-3 underline underline-offset-2"
        >
          Show fewer checks
        </button>
      </div>
    );
  }

  if (attention.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-caption text-ink-2">
          <Verdict passed />
          All {checks.length} checks passed
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-caption text-ink-3 underline underline-offset-2"
        >
          Show details
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {attention.map((check) => (
          <CheckLine key={check.rule} check={check} />
        ))}
      </ul>
      {passedCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start text-caption text-ink-3 underline underline-offset-2"
        >
          +{passedCount} more {passedCount === 1 ? 'check' : 'checks'} passed · Show all
        </button>
      ) : null}
    </div>
  );
}
