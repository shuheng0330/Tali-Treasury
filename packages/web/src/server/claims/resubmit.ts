import type { Claim, ExpenseCategory } from '@tali/shared';

import type { ClaimRepository } from './ports';
import { ServerError } from '../errors';

export interface ResubmitClaimRequest {
  claimId: string;
  submitter: string;
  merchant: string;
  amount: string;
  receiptDate: string;
  category: ExpenseCategory;
  description: string;
}

export interface ResubmitClaimResponse {
  claim: Claim;
  /** False when the claim had already moved on and the fix no longer applies. */
  accepted: boolean;
}

export type ResubmitClaimService = (
  request: ResubmitClaimRequest,
) => Promise<ResubmitClaimResponse>;

/**
 * Puts a corrected claim back in the queue.
 *
 * The receipt itself is never replaced. Its hash is what makes a claim unique
 * and what the duplicate check works from, so a different photograph is a
 * different claim rather than an edit of this one.
 */
export function createResubmitClaimService(deps: {
  claims: ClaimRepository;
}): ResubmitClaimService {
  return async (request) => {
    const context = await deps.claims.getProcessContext(request.claimId);

    if (request.submitter.toLowerCase() !== context.claim.submitter.toLowerCase()) {
      throw new ServerError(
        'processor_forbidden',
        403,
        'Only the member who submitted a claim may correct it',
      );
    }

    if (context.claim.state !== 'needs_correction') {
      throw new ServerError(
        'processing_conflict',
        409,
        `This claim is ${context.claim.state.replace(/_/g, ' ')}, so there is nothing to correct`,
      );
    }

    const result = await deps.claims.resubmit({
      claimId: request.claimId,
      corrections: {
        merchant: request.merchant,
        amount: request.amount,
        receiptDate: request.receiptDate,
        category: request.category,
        description: request.description,
      },
    });

    return { claim: result.claim, accepted: result.status === 'saved' };
  };
}
