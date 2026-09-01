import type {
  Claim,
  ClaimReviewAction,
  PolicyDecision,
} from '@tali/shared';

export function approvalBlockReason(
  claim: Pick<Claim, 'analysis'>,
  decision: PolicyDecision,
): string | null {
  if (claim.analysis?.currency !== 'USDC') {
    return 'Only USDC claims can start payment in this milestone.';
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
    return {
      title: 'Approve and start payment?',
      consequence: 'This immediately starts a Sui Testnet USDC payment to the claimant.',
      confirmLabel: 'Approve and pay',
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
