import { CLAIM_CHIP, type Claim } from '@tali/shared';
import { StatusChip } from '../StatusChip';
import { claimExplanation, paidLabel } from '../../lib/claim-summary';

function outcomeLabel(claim: Claim) {
  if (claim.state === 'rejected') return 'Decision';
  if (claim.state === 'needs_correction') return 'Correction requested';
  if (claim.state === 'payment_failed' || claim.state === 'paying') return 'Payment result';
  if (claim.state === 'awaiting_review') return 'Review reason';
  return 'Status';
}

export function ClaimStatusSummary({
  claim,
  structured = false,
}: {
  claim: Claim;
  structured?: boolean;
}) {
  const reason = claimExplanation(claim);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <StatusChip status={CLAIM_CHIP[claim.state]}
          label={claim.state === 'paid' ? paidLabel(claim) : claim.state === 'paying' ? 'Confirming payment' : undefined} />
      </div>
      {reason ? structured ? (
        <dl className="rounded-control bg-canvas p-3">
          <div>
            <dt className="eyebrow">{outcomeLabel(claim)}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-body text-ink-2">{reason}</dd>
          </div>
        </dl>
      ) : <p className="whitespace-pre-wrap break-words text-body text-ink-2">{reason}</p> : null}
      {claim.state === 'needs_correction' ? (
        structured ? (
          <p className="text-caption text-ink-3">Next: correct the receipt details and resubmit.</p>
        ) : (
          <p className="text-body text-ink-2">Correct the highlighted receipt details, then resubmit the claim for a fresh review.</p>
        )
      ) : null}
    </div>
  );
}
