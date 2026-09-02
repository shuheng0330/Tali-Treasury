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
  paying: boolean;
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
  paying,
  actionsDisabled = false,
  disabledReason,
}: Props) {
  const { claim, decision, agentNote, reason } = item;
  const approvalBlocked = approvalBlockReason(claim, decision);
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
                  <Verdict passed={check.passed} pending={check.pending} />
                </span>
                <span
                  className={`text-caption ${
                    check.pending
                      ? 'text-ink-3'
                      : check.passed
                        ? 'text-ink-2'
                        : 'font-medium text-no'
                  }`}
                >
                  {check.label}
                </span>
                <span className="tnum ml-auto text-right text-caption text-ink-3">
                  {check.detail}
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
          <p className="text-caption text-wait">
            The payment was submitted and has not confirmed yet. Do not send it again
            until the chain says what happened to it.
          </p>
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
