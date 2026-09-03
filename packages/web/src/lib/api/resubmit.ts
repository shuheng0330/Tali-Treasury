import type { Claim, ExpenseCategory } from '@tali/shared';
import { TaliApiError, responseJson } from '@/lib/api/client';
import { DEMO_SUBMITTER } from '@/lib/demo-config';
import type { Sourced } from '@/lib/api/demo';

interface ResubmitResponse {
  claim: Claim;
  accepted: boolean;
}

function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the backend is unreachable';
  }
  if (error.code === 'authentication_required') {
    return 'the demo identity API is switched off';
  }
  return error.message.charAt(0).toLowerCase() + error.message.slice(1);
}

export async function tryResubmitClaim(input: {
  claimId: string;
  merchant: string;
  amount: string;
  receiptDate: string;
  category: ExpenseCategory;
  description: string;
}): Promise<Sourced<ResubmitResponse | null>> {
  const { claimId, ...corrections } = input;
  try {
    const response = await fetch(`/api/claims/${claimId}/resubmit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ submitter: DEMO_SUBMITTER, ...corrections }),
    });
    return {
      data: await responseJson<ResubmitResponse>(response),
      source: 'live',
      reason: null,
    };
  } catch (error) {
    return { data: null, source: 'mock', reason: describe(error) };
  }
}
