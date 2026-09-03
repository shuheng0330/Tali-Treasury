import type {
  Claim,
  ClaimReviewAction,
  PolicyDecision,
} from '@tali/shared';

export function approvalBlockReason(
  claim: Pick<Claim, 'analysis'>,
  decision: PolicyDecision,
): string | null {
  /* Only when the currency is actually known and wrong. `analysis` being
     absent is a different problem, and naming this one puts a tooltip about
     currency beside a row that renders "USDC". */
  if (claim.analysis && claim.analysis.currency !== 'USDC') {
    return 'Only a USDC claim can be paid. This one needs a conversion quote first.';
  }
  if (decision.checks.some((check) => check.onChain && !check.passed)) {
    return 'This claim fails an immutable on-chain mandate check.';
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
