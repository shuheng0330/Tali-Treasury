import type { Claim } from '@tali/shared';

export function paidLabel(claim: Claim): string {
  if (claim.review?.action === 'approve') return 'Paid after review';
  if (claim.decision?.outcome === 'auto_pay') return 'Auto-paid';
  return 'Paid';
}

export function claimExplanation(claim: Claim): string | null {
  if (claim.state === 'needs_correction') {
    return claim.review?.action === 'request_correction' && claim.review.reason?.trim()
      ? claim.review.reason
      : 'The treasurer requested a correction. Contact them for the details.';
  }
  if (claim.state === 'payment_failed') {
    return claim.payment?.message || 'Payment failed. Ask the treasurer to check the transaction.';
  }
  if (claim.state === 'rejected' && claim.review?.action === 'reject' && claim.review.reason?.trim()) {
    return claim.review.reason;
  }
  if (claim.state === 'rejected' || claim.state === 'awaiting_review') {
    const issues = claim.decision?.checks.filter(check => !check.passed && check.rule !== 'fx_quote_approval');
    if (issues?.length) return issues[0]?.detail ?? null;
    return claim.state === 'rejected'
      ? claim.decision?.reason || 'No rejection reason was recorded. Ask the treasurer for details.'
      : 'Waiting for the treasurer to approve the reimbursement.';
  }
  if (claim.state === 'submitted') return 'Submitted. Waiting for evaluation.';
  if (claim.state === 'paying') return 'Payment is being confirmed. Check its status before trying again.';
  return null;
}
