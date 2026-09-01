import type { PayrollBreakdown, PayrollRunView } from '@tali/shared';
import { TaliApiError, responseJson } from '@/lib/api/client';
import type { Sourced } from '@/lib/api/demo';

export interface PreviewRequest {
  employee: string;
  gross: string;
  age: number;
  citizenship: 'local' | 'foreign';
}

/** Sent when the run deliberately underpays a body, to show the refusal. */
export interface RunRequest extends PreviewRequest {
  underpay?: 'epf' | 'socso' | 'eis';
}

function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the payroll API is unreachable';
  }

  /* A route that does not exist yet answers with Next's HTML 404, which parses
     as an unreadable response. Saying so would blame the server for a route
     nobody has written. */
  if (error.status === 404) {
    return 'the payroll API is not built yet';
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
 * Falls back to the caller's sample rather than to nothing: the payroll screen
 * is readable either way, and the banner says which it is showing. The claim
 * flow deliberately does the opposite, because an invented merchant beside a
 * photograph reads as an extraction. An invented salary beside a name does not.
 */
export async function tryPreviewPayroll(
  request: PreviewRequest,
  fallback: PayrollBreakdown,
): Promise<Sourced<PayrollBreakdown>> {
  try {
    const data = await post<PayrollBreakdown>('/api/payroll/preview', request);
    return { data, source: 'live', reason: null };
  } catch (error) {
    return { data: fallback, source: 'mock', reason: describe(error) };
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
