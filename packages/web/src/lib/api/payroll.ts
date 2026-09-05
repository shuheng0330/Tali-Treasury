import type { PayrollBreakdown, PayrollRunView } from '@tali/shared';
import { TaliApiError, responseJson } from '@/lib/api/client';
import type { Sourced } from '@/lib/api/demo';

export interface PreviewRequest {
  mandateId: string;
  gross: string;
  age: number;
  citizenship: 'local' | 'foreign';
}

/** Sent when the run deliberately underpays a body, to show the refusal. */
export interface RunRequest extends PreviewRequest {
  underpay?: 'epf' | 'socso' | 'eis';
  fxApproval?: {
    myrPerUsd: string;
    rateTimestampMs: number;
  };
}

function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the payroll API is unreachable';
  }

  if (error.status === 404) {
    /* The routes exist. A 404 from them means the mandate or the stream the
       request named was not found, which is what the server already says. */
    return error.message.charAt(0).toLowerCase() + error.message.slice(1);
  }
  if (error.code === 'authentication_required') {
    return 'the demo identity API is switched off';
  }
  return error.message.charAt(0).toLowerCase() + error.message.slice(1);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return responseJson<T>(response);
}

/**
 * Falls back to the caller's sample when one is offered: the payroll screen is
 * readable either way, and the banner says which it is showing.
 *
 * The fallback is only sound for the wage it was computed for. Once the figures
 * on screen can be edited, showing a stored split for a different salary would
 * put the wrong arithmetic under the number somebody just typed, so callers
 * pass nothing and get null instead.
 */
export async function tryPreviewPayroll(
  request: PreviewRequest,
  fallback?: PayrollBreakdown,
): Promise<Sourced<PayrollBreakdown | null>> {
  try {
    const data = await post<PayrollBreakdown>('/api/payroll/preview', request);
    return { data, source: 'live', reason: null };
  } catch (error) {
    return { data: fallback ?? null, source: 'mock', reason: describe(error) };
  }
}

export interface RunAttempt extends Sourced<PayrollRunView | null> {
  /**
   * True when the transaction was sent and nobody knows whether it landed.
   * The screen must not say the wages stayed put.
   */
  uncertain: boolean;
}

export async function tryRunPayroll(request: RunRequest): Promise<RunAttempt> {
  try {
    const data = await post<PayrollRunView>('/api/payroll/runs', request);
    return { data, source: 'live', reason: null, uncertain: false };
  } catch (error) {
    const uncertain =
      error instanceof TaliApiError && error.code === 'payment_submission_uncertain';
    return { data: null, source: 'mock', reason: describe(error), uncertain };
  }
}
