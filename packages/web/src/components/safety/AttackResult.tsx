import type { PaymentResult, RuleCheck } from '@tali/shared';
import { EXPLORER, toDisplay } from '@tali/shared';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1">
      <span className="w-24 shrink-0 text-label uppercase text-ink-3">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-caption">{children}</span>
    </div>
  );
}

function Mark({ passed }: { passed: boolean }) {
  return passed ? (
    <svg viewBox="0 0 12 12" width="12" height="12" className="text-ok" aria-hidden>
      <path d="M2 6.4 L4.8 9 L10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 12 12" width="12" height="12" className="text-no" aria-hidden>
      <path d="M3 3 L9 9 M9 3 L3 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  attempted: string;
  payment: PaymentResult;
  checks: RuleCheck[];
  onAgain: () => void;
  onCounterfactual: () => void;
}

export function AttackResult({ attempted, payment, checks, onAgain, onCounterfactual }: Props) {
  const blocked = !payment.ok;
  const failed = checks.filter((check) => !check.passed);
  const links = EXPLORER.tx(payment.digest ?? '');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 rounded-card border border-rule bg-surface px-6 py-8 text-center">
        {blocked ? (
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-accent" aria-hidden>
            <path d="M12 2.5 4.5 5.5v6c0 4.6 3.1 8.5 7.5 10 4.4-1.5 7.5-5.4 7.5-10v-6z" strokeLinejoin="round" />
            <path d="M8.8 12.2 11 14.4l4.2-4.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.7" className="text-ok" aria-hidden>
            <path d="M13 2 4 14h7l-1 8 9-12h-7z" strokeLinejoin="round" />
          </svg>
        )}

        <h2 className="text-title">{blocked ? 'Blocked by your rules' : 'Paid'}</h2>
        <p className="max-w-md text-body text-ink-2">
          {blocked
            ? `The mandate refused a ${toDisplay(attempted)} transfer. Nothing left your treasury.`
            : 'Same contract, same agent, same code path. This one was inside your rules.'}
        </p>
      </div>

      <section className="flex flex-col rounded-card border border-rule bg-surface">
        <h3 className="border-b border-rule px-4 py-2 text-label uppercase text-ink-3">
          What the chain said
        </h3>
        <div className="flex flex-col px-4 py-3">
          <Row label="Status">{blocked ? 'FAILURE' : 'SUCCESS'}</Row>
          {blocked ? <Row label="Abort">{payment.abortKey}</Row> : null}
          {blocked ? <Row label="Message">{payment.message}</Row> : null}
          <Row label="Digest">{payment.digest}</Row>
          <Row label="Checkpoint">{payment.checkpoint}</Row>
          <Row label="Gas burned">{toDisplay(payment.gasUsed ?? '0', 5)} SUI</Row>
          <Row label="Finality">{payment.finalityMs} ms</Row>
          {payment.rawError ? (
            <details className="pt-2">
              <summary className="cursor-pointer text-caption text-ink-3">Raw abort</summary>
              <pre className="mt-2 overflow-x-auto rounded-control bg-canvas p-3 font-mono text-caption">
                {payment.rawError}
              </pre>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-3">
            <a href={links.suiscan} target="_blank" rel="noreferrer" className="text-caption text-accent underline underline-offset-4">
              Open in Suiscan
            </a>
            <a href={links.suivision} target="_blank" rel="noreferrer" className="text-caption text-accent underline underline-offset-4">
              Open in SuiVision
            </a>
          </div>
        </div>
      </section>

      <section className="flex flex-col rounded-card border border-rule bg-surface">
        <h3 className="border-b border-rule px-4 py-2 text-label uppercase text-ink-3">
          Rule by rule
        </h3>
        <ul className="flex flex-col divide-y divide-rule">
          {checks.map((check) => (
            <li key={check.rule} className="flex items-baseline gap-3 px-4 py-2">
              <span className="translate-y-0.5">
                <Mark passed={check.passed} />
              </span>
              <span className={`text-caption ${check.passed ? 'text-ink-2' : 'font-medium text-no'}`}>
                {check.label}
              </span>
              <span className="tnum ml-auto text-caption text-ink-3">{check.detail}</span>
            </li>
          ))}
        </ul>
        {failed.length > 1 ? (
          <p className="border-t border-rule px-4 py-2 text-caption text-ink-3">
            {failed.length} independent rules would each have stopped this.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-4">
        <h3 className="text-label uppercase text-ink-3">Treasury before → after</h3>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-caption text-ink-3">before</span>
          <span className="tnum text-subhead">{toDisplay(payment.budgetBefore)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-caption text-ink-3">after</span>
          <span className="tnum text-subhead">{toDisplay(payment.budgetAfter)}</span>
        </div>
        <p className="pt-1 text-caption text-ink-3">
          {payment.budgetBefore === payment.budgetAfter
            ? 'Identical. Nothing moved.'
            : `Moved by exactly ${toDisplay(
                (BigInt(payment.budgetBefore) - BigInt(payment.budgetAfter)).toString(),
              )}.`}
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="rounded-control border border-rule px-4 py-2 text-caption transition-colors duration-150 hover:bg-raised"
        >
          Try another attack
        </button>
        {blocked ? (
          <button
            type="button"
            onClick={onCounterfactual}
            className="rounded-control bg-accent px-4 py-2 text-caption font-medium text-surface transition-colors duration-150 hover:bg-accent/90"
          >
            Now watch a valid claim get paid →
          </button>
        ) : null}
      </div>
    </div>
  );
}
