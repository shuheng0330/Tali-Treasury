import type {
  Claim,
  ClaimReviewAction,
  PolicyDecision,
} from '@tali/shared';
import { claimPaymentAmount } from '@tali/shared';

export function approvalBlockReason(
  claim: Pick<Claim, 'analysis'> & Partial<Pick<Claim, 'amount' | 'fxQuote'>>,
  decision: PolicyDecision,
): string | null {
  if (claim.analysis?.currency !== 'USDC' && claimPaymentAmount({ ...claim, amount: claim.amount ?? '' }, Date.now()) === null) {
    return 'A current MYR → USDC quote is required. Refresh the quote and review again.';
  }
  if (decision.checks.some((check) => check.onChain && !check.passed)) {
    return 'This claim fails an immutable on-chain mandate check.';
  }
  if (decision.checks.some(check => !check.passed && ['fx_quote_valid', 'not_duplicate'].includes(check.rule))) {
    return 'The quote or duplicate-receipt check blocks payment.';
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
