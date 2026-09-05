import type {
  Claim,
  ClaimReviewAction,
  PolicyDecision,
  ReviewClaimRequest,
} from '@tali/shared';
import { claimPaymentAmount } from '@tali/shared';

export function approvalBlockReason(
  claim: Pick<Claim, 'id' | 'eventId' | 'submitter' | 'amount' | 'analysis' | 'fxQuote'>,
  decision: PolicyDecision,
): string | null {
  /* Only when the currency is actually known and wrong. `analysis` being
     absent is a different problem, and naming this one puts a tooltip about
     currency beside a row that renders "USDC". */
  if (claim.analysis?.currency === 'MYR') {
    if (claimPaymentAmount(claim, Date.now()) === null) {
      return 'The MYR-to-USDC quote expired. Refresh the quote and review again.';
    }
  } else if (claim.analysis && claim.analysis.currency !== 'USDC') {
    return 'This claim needs an explicit conversion quote before it can be paid.';
  }
  /**
   * Name the rule that failed, not the category it belongs to.
   *
   * This used to say only "This claim fails an immutable on-chain mandate
   * check", which is true of five different rules and actionable for none of
   * them. An expense treasury quietly reached its expiry mid-demo and every
   * claim against it became unapprovable with that sentence as the only
   * explanation — two hours went into creating a payroll mandate, which is a
   * different contract entirely and could never have helped. The check already
   * carries a plain description of what went wrong; it was being thrown away
   * one line before the reader needed it.
   */
  const failed = decision.checks.find((check) => check.onChain && !check.passed);
  if (failed) {
    return `${failed.detail}. The contract enforces this, so it cannot be approved until the mandate itself changes.`;
  }
  return null;
}

export function validateReviewReason(
  action: ClaimReviewAction,
  reason: string,
): string | null {
  if (action === 'approve') return null;
  if (reason.length === 0) return 'Enter a reason before continuing.';
  if (reason !== reason.trim()) return 'Remove spaces from the start or end.';
  if (reason.length > 500) return 'Keep the reason to 500 characters or fewer.';
  return null;
}

/** Builds the exact payload sent by the treasury review screen. */
export function reviewRequestForClaim(
  claim: Claim,
  action: ClaimReviewAction,
  reason?: string,
): ReviewClaimRequest {
  return action === 'approve'
    ? {
        action: 'approve',
        ...(claim.analysis?.currency === 'MYR' && claim.fxQuote?.id
          ? { quoteId: claim.fxQuote.id }
          : {}),
      }
    : { action, reason: reason ?? '' };
}

export function reviewDialogCopy(action: ClaimReviewAction): {
  title: string;
  consequence: string;
  confirmLabel: string;
} {
  if (action === 'approve') {
    /* Approving records the decision and nothing else. The transfer is a
       separate button, so promising a payment here would describe a step this
       one does not take. */
    return {
      title: 'Approve this claim?',
      consequence:
        'Nothing is paid yet. The claim moves to approved, and releasing the payment is a separate step.',
      confirmLabel: 'Record the approval',
    };
  }
  if (action === 'reject') {
    return {
      title: 'Reject this claim?',
      consequence: 'The rejection and your reason will be recorded in the audit history.',
      confirmLabel: 'Reject claim',
    };
  }
  return {
    title: 'Request a correction?',
    consequence: 'The claim leaves your review queue until the member resubmits it.',
    confirmLabel: 'Request correction',
  };
}
