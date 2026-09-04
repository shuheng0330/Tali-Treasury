import { CLAIM_CHIP, type Claim } from '@tali/shared';
import { StatusChip } from '../StatusChip';
import { claimExplanation, paidLabel } from '../../lib/claim-summary';

export function ClaimStatusSummary({ claim }: { claim: Claim }) {
  const reason = claimExplanation(claim);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <StatusChip status={CLAIM_CHIP[claim.state]}
          label={claim.state === 'paid' ? paidLabel(claim) : claim.state === 'paying' ? 'Confirming payment' : undefined} />
      </div>
      {reason ? <p className="whitespace-pre-wrap break-words text-body text-ink-2">{reason}</p> : null}
      {claim.state === 'needs_correction' ? (
        <p className="text-body text-ink-2">Correct the highlighted receipt details, then resubmit the claim for a fresh review.</p>
      ) : null}
    </div>
  );
}
