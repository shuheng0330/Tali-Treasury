import { Money } from '@/components/Money';
import { EXPLORER } from '@tali/shared';
import type { ClaimReviewAction, ReviewQueueItem } from '@tali/shared';
import { approvalBlockReason } from '@/lib/review-actions';
import { ChecklistSummary, type AnnotatedCheck } from './ChecklistSummary';

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
  onCheckPayment: (id: string) => void;
  paying: boolean;
  reconciling: boolean;
  /** No write is possible at all — nobody is signed in to make one. */
  actionsDisabled?: boolean;
  /** Carried by every greyed review control, not only the first one. */
  disabledReason?: string;
  /** Only a recorded verdict is impossible. Evaluating, paying and recording an
   *  outcome write no review columns, so they stay available. */
  reviewsBlocked?: boolean;
  reviewsBlockedReason?: string;
}

export function ClaimRow({
  item,
  processing,
  pendingAction,
  onProcess,
  onReview,
  onPay,
  onCheckPayment,
  paying,
  reconciling,
  actionsDisabled = false,
  disabledReason,
  reviewsBlocked = false,
  reviewsBlockedReason,
}: Props) {
  const { claim, decision, agentNote, reason } = item;
  const approvalBlocked = approvalBlockReason(claim, decision);

  /* The cap and the budget are measured in USDC, so for anything else they
     were never evaluated. Decisions stored before the engine started saying so
     still carry a tick that was never earned, and the row is the last place
     that can tell. */
  const unquoted = Boolean(claim.analysis && claim.analysis.currency !== 'USDC');
  const notEvaluated = (check: (typeof decision.checks)[number]) =>
    check.pending === true ||
    (unquoted && (check.rule === 'per_claim_max' || check.rule === 'total_budget'));
  const annotatedChecks: AnnotatedCheck[] = decision.checks.map((check) => {
    const pending = notEvaluated(check);
    return {
      rule: check.rule,
      label: check.label,
      passed: check.passed,
      notEvaluated: pending,
      detail: pending && !check.pending
        ? 'Checked after an explicit USDC conversion quote is attached'
        : check.detail,
    };
  });
  const awaitingPolicy = claim.state === 'submitted' && claim.decision === null;
  const reviewPending = pendingAction !== null;
  const verdictBlocked = actionsDisabled || reviewsBlocked;
  const verdictReason = actionsDisabled
    ? disabledReason
    : reviewsBlocked
      ? reviewsBlockedReason
      : undefined;

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

      <div className="ml-7 rounded-card border border-rule bg-canvas p-4">
        {awaitingPolicy ? (
          <p className="text-caption text-ink-2">Awaiting server policy evaluation.</p>
        ) : (
          <ChecklistSummary checks={annotatedChecks} />
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
              it. Nothing retries automatically — the digest below is what was signed,
              and checking reads its outcome from the chain.
            </p>
            {claim.paymentAttempt ? (
              <a
                className="link self-start font-mono text-caption"
                href={EXPLORER.tx(claim.paymentAttempt.digest).suiscan}
                target="_blank"
                rel="noreferrer"
              >
                {claim.paymentAttempt.digest.slice(0, 10)}…
                {claim.paymentAttempt.digest.slice(-8)}
              </a>
            ) : null}
            <button
              type="button"
              disabled={reconciling || actionsDisabled}
              onClick={() => onCheckPayment(claim.id)}
              className="btn btn--primary h-9 w-fit px-5 text-label"
              title={actionsDisabled ? disabledReason : undefined}
            >
              {reconciling ? 'Checking Sui…' : 'Check payment status'}
            </button>
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
              disabled={approvalBlocked !== null || reviewPending || verdictBlocked}
              onClick={() => onReview(claim.id, 'approve')}
              className="btn btn--primary h-9 px-5 text-label"
              title={approvalBlocked ?? verdictReason}
            >
              {approvalBlocked
                ? 'Cannot approve'
                : pendingAction === 'approve'
                  ? 'Approving…'
                  : 'Approve'}
            </button>
            <button
              type="button"
              disabled={reviewPending || verdictBlocked}
              onClick={() => onReview(claim.id, 'reject')}
              className="btn btn--danger h-9 px-5 text-label"
              title={verdictReason}
            >
              {pendingAction === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
            <button
              type="button"
              disabled={reviewPending || verdictBlocked}
              onClick={() => onReview(claim.id, 'request_correction')}
              className="btn btn--ghost h-9 px-5 text-label"
              title={verdictReason}
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
