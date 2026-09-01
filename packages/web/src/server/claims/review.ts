import type { Claim, ClaimReview, ReviewAction } from '@tali/shared';

import type { ClaimRepository, ReviewedClaimState } from './ports';
import { ServerError } from '../errors';

export interface ReviewClaimRequest {
  claimId: string;
  reviewer: string;
  action: ReviewAction;
  reason?: string;
}

export interface ReviewClaimResponse {
  claim: Claim;
  /** False when somebody else had already decided and their decision stands. */
  recorded: boolean;
}

const RESULT: Record<ReviewAction, ReviewedClaimState> = {
  approve: 'approved',
  reject: 'rejected',
  request_correction: 'needs_correction',
};

export type ReviewClaimService = (
  request: ReviewClaimRequest,
) => Promise<ReviewClaimResponse>;

/**
 * Records what the treasurer decided about a claim the engine sent to review.
 *
 * Approving does not pay anything. It moves the claim to `approved`, which is
 * where the payment path picks it up — keeping the decision and the transfer
 * as separate steps, so a signing failure never looks like a change of mind.
 */
export function createReviewClaimService(deps: {
  claims: ClaimRepository;
  now: () => number;
}): ReviewClaimService {
  return async (request) => {
    const context = await deps.claims.getProcessContext(request.claimId);

    if (request.reviewer.toLowerCase() !== context.event.treasurer.toLowerCase()) {
      throw new ServerError(
        'processor_forbidden',
        403,
        'Only the event treasurer may review claims',
      );
    }

    const reason = request.reason?.trim();
    if (request.action !== 'approve' && !reason) {
      /* Without one, nobody afterwards can tell a considered rejection from a
         misclick, and the member has nothing to act on. */
      throw new ServerError(
        'invalid_request',
        400,
        request.action === 'reject'
          ? 'A rejection needs a reason the member can read'
          : 'A correction request needs to say what to correct',
      );
    }

    const review: ClaimReview = {
      action: request.action,
      reviewer: context.event.treasurer,
      reviewedAt: new Date(deps.now()).toISOString(),
      ...(reason ? { reason } : {}),
    };

    const saved = await deps.claims.saveReview({
      claimId: request.claimId,
      review,
      state: RESULT[request.action],
    });

    return { claim: saved.claim, recorded: saved.status === 'saved' };
  };
}
