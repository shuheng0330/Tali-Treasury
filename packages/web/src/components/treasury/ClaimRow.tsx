import { Money } from '@/components/Money';
import type { ReviewQueueItem } from '@tali/shared';

function Verdict({ passed }: { passed: boolean }) {
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

function ReasonMark({ reason }: { reason: ReviewQueueItem['reason'] }) {
  if (reason === 'rule_failed') {
    return (
      <span className="mt-1 flex h-4 w-4 items-center justify-center text-no" title="A rule failed">
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
          <path d="M6 1 L11.2 10.4 H0.8 Z" fill="currentColor" />
        </svg>
      </span>
    );
  }

  return (
    <span className="mt-1 flex h-4 w-4 items-center justify-center text-wait" title="Awaiting review">
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
        <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6 6 v-2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function relative(atMs: number) {
  const minutes = Math.round((Date.now() - atMs) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

interface Props {
  item: ReviewQueueItem;
  processing: boolean;
  onProcess: (id: string) => void;
}

export function ClaimRow({ item, processing, onProcess }: Props) {
  const { claim, decision, agentNote, reason } = item;
  const immutableFailure = decision.checks.some((check) => check.onChain && !check.passed);
  const awaitingPolicy = claim.state === 'submitted' && claim.decision === null;

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-start gap-3">
        <ReasonMark reason={reason} />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-body">{claim.merchant}</span>
          <span className="text-caption text-ink-3">
            {claim.submitterName} · <span className="capitalize">{claim.category}</span> ·{' '}
            {/* The demo timestamps are relative to module load, and the server
                module loads before the client bundle, so the two renders
                legitimately disagree by a minute or two. */}
            <span suppressHydrationWarning>{relative(claim.createdAtMs)}</span>
          </span>
        </div>

        <Money amount={claim.amount} unit={claim.analysis?.currency ?? 'USDC'} size="row" className="shrink-0" />
      </div>

      <div className="ml-7 flex flex-col gap-2 rounded-card border border-rule bg-canvas p-4">
        {awaitingPolicy ? (
          <p className="text-caption text-ink-2">Awaiting server policy evaluation.</p>
        ) : (
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {decision.checks.map((check) => (
              <li key={check.rule} className="flex items-baseline gap-2">
                <span className="translate-y-0.5">
                  <Verdict passed={check.passed} />
                </span>
                <span className={`text-caption ${check.passed ? 'text-ink-2' : 'font-medium text-no'}`}>
                  {check.label}
                </span>
                <span className="tnum ml-auto text-caption text-ink-3">{check.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {agentNote ? (
        <p className="ml-7 flex gap-2 text-caption italic text-ink-3">
          <span className="not-italic" aria-hidden>
            ◇
          </span>
          {agentNote}
        </p>
      ) : null}

      <div className="ml-7 flex flex-wrap items-center gap-3">
        {awaitingPolicy ? (
          <button
            type="button"
            disabled={processing}
            onClick={() => onProcess(claim.id)}
            className="btn btn--primary h-9 px-5 text-label"
          >
            {processing ? 'Evaluating…' : 'Evaluate claim'}
          </button>
        ) : (
          <>
            {/* Disabled rather than wired to a local hide. A button that made
                the row disappear, and let it return on the next read, would be
                claiming a decision nobody recorded. */}
            <button
              type="button"
              disabled
              className="btn btn--primary h-9 px-5 text-label"
              title={
                immutableFailure
                  ? 'This claim violates an immutable on-chain rule'
                  : undefined
              }
            >
              {immutableFailure ? 'Cannot approve' : 'Approve'}
            </button>
            <button type="button" disabled className="btn btn--ghost h-9 px-5 text-label">
              Reject
            </button>
            <p className="text-caption text-ink-3">
              {immutableFailure
                ? 'A rule the contract enforces already refuses this claim.'
                : 'Recording a decision needs the review endpoint, which is not built yet.'}
            </p>
          </>
        )}
      </div>
    </li>
  );
}
