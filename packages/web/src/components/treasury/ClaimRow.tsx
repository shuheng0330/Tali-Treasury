import { useState } from 'react';
import { Money } from '@/components/Money';
import type { ClaimReviewAction, ReviewQueueItem } from '@tali/shared';
import { approvalBlockReason } from '@/lib/review-actions';

function Verdict({ passed, pending }: { passed: boolean; pending?: boolean }) {
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
  pendingAction: ClaimReviewAction | null;
  onProcess: (id: string) => void;
  onReview: (id: string, action: ClaimReviewAction) => void;
  onPay: (id: string) => void;
  onReconcile: (id: string, outcome: 'paid' | 'not_paid', digest?: string) => void;
  paying: boolean;
  reconciling: boolean;
  actionsDisabled?: boolean;
  /** Carried by every greyed review control, not only the first one. */
  disabledReason?: string;
}

export function ClaimRow({
  item,
  processing,
  pendingAction,
  onProcess,
  onReview,
  onPay,
  onReconcile,
  paying,
  reconciling,
  actionsDisabled = false,
  disabledReason,
}: Props) {
  const { claim, decision, agentNote, reason } = item;
  const approvalBlocked = approvalBlockReason(claim, decision);
  const [digest, setDigest] = useState('');
  const [resolving, setResolving] = useState(false);

  /* The cap and the budget are measured in USDC, so for anything else they
     were never evaluated. Decisions stored before the engine started saying so
     still carry a tick that was never earned, and the row is the last place
     that can tell. */
  const unquoted = Boolean(claim.analysis && claim.analysis.currency !== 'USDC');
  const notEvaluated = (check: (typeof decision.checks)[number]) =>
    check.pending === true ||
    (unquoted && (check.rule === 'per_claim_max' || check.rule === 'total_budget'));
  const awaitingPolicy = claim.state === 'submitted' && claim.decision === null;
  const reviewPending = pendingAction !== null;

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
              <li key={check.rule} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="translate-y-0.5">
                  <Verdict passed={check.passed} pending={notEvaluated(check)} />
                </span>
                <span
                  className={`text-caption ${
                    notEvaluated(check)
                      ? 'text-ink-3'
                      : check.passed
                        ? 'text-ink-2'
                        : 'font-medium text-no'
                  }`}
                >
                  {check.label}
                </span>
                <span className="tnum ml-auto text-right text-caption text-ink-3">
                  {notEvaluated(check) && !check.pending
                    ? 'Checked after an explicit USDC conversion quote is attached'
                    : check.detail}
                </span>
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
        {claim.state === 'paying' ? (
          <div className="flex w-full flex-col gap-2">
            <p className="text-caption text-wait">
              The payment was submitted and the server never learned what happened to
              it. It may or may not have reached the chain, so nothing retries it
              automatically — read the mandate on Suiscan and record what you find.
            </p>
            {resolving ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  onReconcile(claim.id, 'paid', digest.trim());
                  setResolving(false);
                  setDigest('');
                }}
              >
                <label className="text-caption text-ink-2" htmlFor={`digest-${claim.id}`}>
                  The digest of the transaction that paid it
                </label>
                <input
                  id={`digest-${claim.id}`}
                  value={digest}
                  onChange={(event) => setDigest(event.target.value)}
                  className="w-full rounded-control border border-rule bg-surface px-3 py-2 font-mono text-caption"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={digest.trim().length === 0 || reconciling || actionsDisabled}
                    className="btn btn--primary h-9 px-5 text-label"
                  >
                    {reconciling ? 'Recording…' : 'It was paid'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolving(false)}
                    className="btn btn--ghost h-9 px-5 text-label"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={reconciling || actionsDisabled}
                  onClick={() => setResolving(true)}
                  className="btn btn--ghost h-9 px-5 text-label"
                  title={actionsDisabled ? disabledReason : undefined}
                >
                  It was paid…
                </button>
                <button
                  type="button"
                  disabled={reconciling || actionsDisabled}
                  onClick={() => onReconcile(claim.id, 'not_paid')}
                  className="btn btn--ghost h-9 px-5 text-label"
                  title={actionsDisabled ? disabledReason : undefined}
                >
                  {reconciling ? 'Recording…' : 'Nothing was paid'}
                </button>
              </div>
            )}
          </div>
        ) : claim.state === 'payment_failed' ? (
          <>
            <button
              type="button"
              disabled={paying || actionsDisabled}
              onClick={() => onPay(claim.id)}
              className="btn btn--primary h-9 px-5 text-label"
              title={actionsDisabled ? disabledReason : undefined}
            >
              {paying ? 'Paying…' : 'Try the payment again'}
            </button>
            <p className="text-caption text-ink-3">
              {claim.payment?.message ?? 'The payment did not go through.'} Nothing left
              the mandate, so this can be released again.
            </p>
          </>
        ) : claim.state === 'needs_correction' ? (
          <p className="text-caption text-ink-3">
            Sent back to {claim.submitterName}
            {claim.review?.reason ? `: ${claim.review.reason}` : ''}. It returns here once
            they resubmit it.
          </p>
        ) : claim.state === 'approved' ? (
          <>
            <button
              type="button"
              disabled={paying || actionsDisabled}
              onClick={() => onPay(claim.id)}
              className="btn btn--primary h-9 px-5 text-label"
              title={actionsDisabled ? disabledReason : undefined}
            >
              {paying ? 'Paying…' : 'Release the payment'}
            </button>
            <p className="text-caption text-ink-3">
              Approved. The transfer is a separate step, so a signing failure never
              reads as a change of mind.
            </p>
          </>
        ) : awaitingPolicy ? (
          <button
            type="button"
            disabled={processing || actionsDisabled}
            onClick={() => onProcess(claim.id)}
            className="btn btn--primary h-9 px-5 text-label"
            title={actionsDisabled ? disabledReason : undefined}
          >
            {processing ? 'Evaluating…' : 'Evaluate claim'}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={approvalBlocked !== null || reviewPending || actionsDisabled}
              onClick={() => onReview(claim.id, 'approve')}
              className="btn btn--primary h-9 px-5 text-label"
              title={approvalBlocked ?? (actionsDisabled ? disabledReason : undefined)}
            >
              {approvalBlocked
                ? 'Cannot approve'
                : pendingAction === 'approve'
                  ? 'Approving…'
                  : 'Approve'}
            </button>
            <button
              type="button"
              disabled={reviewPending || actionsDisabled}
              onClick={() => onReview(claim.id, 'reject')}
              className="btn btn--danger h-9 px-5 text-label"
              title={actionsDisabled ? disabledReason : undefined}
            >
              {pendingAction === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
            <button
              type="button"
              disabled={reviewPending || actionsDisabled}
              onClick={() => onReview(claim.id, 'request_correction')}
              className="btn btn--ghost h-9 px-5 text-label"
              title={actionsDisabled ? disabledReason : undefined}
            >
              {pendingAction === 'request_correction'
                ? 'Requesting…'
                : 'Request correction'}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
