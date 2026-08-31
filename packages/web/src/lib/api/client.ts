import type {
  AnalyzeReceiptResponse,
  Claim,
  CreateClaimRequest,
  CreateClaimResponse,
  ListClaimsResponse,
} from '@tali/shared';
import { isApiError } from '@tali/shared';
import { DEMO_EVENT_ID, DEMO_VIEWER } from '@/lib/config';
import { recentClaims } from '@/lib/mock/api';

export type Source = 'live' | 'mock';

export interface Sourced<T> {
  data: T;
  source: Source;
  /** Why the live call was not used. Null when it was. */
  reason: string | null;
}

/**
 * Turns whatever came back into one short sentence fit for a banner. The server
 * sanitises its own errors, so the message is safe to show, but the codes read
 * better than the prose for the two cases a visitor can actually act on.
 */
async function describe(response: Response): Promise<string> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return `the backend replied ${response.status}`;
  }

  if (!isApiError(body)) return `the backend replied ${response.status}`;

  if (body.error === 'authentication_required') {
    return 'the demo identity API is switched off';
  }
  if (body.error === 'analysis_failed') {
    return 'receipt analysis is not configured yet';
  }
  // These land mid-sentence in the banner, and every server message starts with
  // a capital of its own ("The database operation failed").
  return body.message.charAt(0).toLowerCase() + body.message.slice(1);
}

function unreachable(error: unknown): string {
  return error instanceof Error && error.name === 'AbortError'
    ? 'the backend did not answer in time'
    : 'the backend is unreachable';
}

/** Long enough for a cold serverless start, short enough not to stall a demo. */
const TIMEOUT_MS = 15_000;

async function call(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/**
 * Null data means the receipt was not read. It deliberately does not fall back
 * to a sample analysis: that would put an invented merchant and amount in an
 * editable form beside the photograph the visitor just took, which reads as an
 * extraction rather than as a blank. The confirm screen already has a path for
 * this and it says so in words.
 */
export async function analyzeReceipt(
  file: File,
): Promise<Sourced<AnalyzeReceiptResponse | null>> {
  const fallback = (reason: string): Sourced<AnalyzeReceiptResponse | null> => ({
    data: null,
    source: 'mock',
    reason,
  });

  const form = new FormData();
  form.append('receipt', file);
  form.append('eventId', DEMO_EVENT_ID);
  form.append('submitter', DEMO_VIEWER);

  let response: Response;
  try {
    response = await call('/api/receipts/analyze', { method: 'POST', body: form });
  } catch (error) {
    return fallback(unreachable(error));
  }

  if (!response.ok) return fallback(await describe(response));

  return { data: (await response.json()) as AnalyzeReceiptResponse, source: 'live', reason: null };
}

export async function createClaim(
  request: CreateClaimRequest,
): Promise<Sourced<CreateClaimResponse | null>> {
  let response: Response;
  try {
    response = await call('/api/claims', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (error) {
    return { data: null, source: 'mock', reason: unreachable(error) };
  }

  if (!response.ok) {
    return { data: null, source: 'mock', reason: await describe(response) };
  }

  return { data: (await response.json()) as CreateClaimResponse, source: 'live', reason: null };
}

export async function listClaims(): Promise<Sourced<Claim[]>> {
  const url = `/api/events/${DEMO_EVENT_ID}/claims?viewer=${encodeURIComponent(DEMO_VIEWER)}`;

  let response: Response;
  try {
    response = await call(url);
  } catch (error) {
    return { data: recentClaims, source: 'mock', reason: unreachable(error) };
  }

  if (!response.ok) {
    return { data: recentClaims, source: 'mock', reason: await describe(response) };
  }

  const body = (await response.json()) as ListClaimsResponse;
  return { data: body.claims, source: 'live', reason: null };
}
