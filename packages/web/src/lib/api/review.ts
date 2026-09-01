import type { Claim, PaymentResult, ReviewAction } from '@tali/shared';
import { TaliApiError, responseJson } from '@/lib/api/client';
import { DEMO_TREASURER } from '@/lib/demo-config';
import type { Sourced } from '@/lib/api/demo';

interface ReviewResponse {
  claim: Claim;
  recorded: boolean;
}

function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the backend is unreachable';
  }
  if (error.status === 404) return 'the review endpoint is not built yet';
  if (error.code === 'authentication_required') {
    return 'the demo identity API is switched off';
  }
  return error.message.charAt(0).toLowerCase() + error.message.slice(1);
}

export async function tryReviewClaim(input: {
  claimId: string;
  action: ReviewAction;
  reason?: string;
}): Promise<Sourced<ReviewResponse | null>> {
  try {
    const response = await fetch(`/api/claims/${input.claimId}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reviewer: DEMO_TREASURER,
        action: input.action,
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    });
    return { data: await responseJson<ReviewResponse>(response), source: 'live', reason: null };
  } catch (error) {
    return { data: null, source: 'mock', reason: describe(error) };
  }
}

interface PayResponse {
  claim: Claim;
  payment: PaymentResult;
}

export async function tryPayClaim(claimId: string): Promise<Sourced<PayResponse | null>> {
  try {
    const response = await fetch(`/api/claims/${claimId}/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ processor: DEMO_TREASURER }),
    });
    return { data: await responseJson<PayResponse>(response), source: 'live', reason: null };
  } catch (error) {
    return { data: null, source: 'mock', reason: describe(error) };
  }
}
