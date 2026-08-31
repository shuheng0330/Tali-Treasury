import type {
  AnalyzeReceiptResponse,
  Claim,
  CreateClaimRequest,
  CreateClaimResponse,
} from '@tali/shared';
import { analyzeReceipt, createClaim, listClaims, TaliApiError } from '@/lib/api/client';
import { DEMO_EVENT_ID, DEMO_SUBMITTER } from '@/lib/demo-config';
import { recentClaims } from '@/lib/mock/api';

export type Source = 'live' | 'mock';

export interface Sourced<T> {
  data: T;
  source: Source;
  /** Why the live call was not used. Null when it was. */
  reason: string | null;
}

/**
 * One short clause fit for the middle of a banner sentence. The server
 * sanitises its own messages, so they are safe to show, but two of the codes
 * read better than prose the visitor can do nothing about.
 */
function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the backend is unreachable';
  }

  if (error.code === 'authentication_required') {
    return 'the demo identity API is switched off';
  }
  if (error.code === 'analysis_failed') {
    return 'receipt analysis is not configured yet';
  }
  // These land mid-sentence, and every server message starts with a capital of
  // its own ("The database operation failed").
  return error.message.charAt(0).toLowerCase() + error.message.slice(1);
}

/**
 * Null data means the receipt was not read. It deliberately does not fall back
 * to a sample analysis: that would put an invented merchant and amount in an
 * editable form beside the photograph the visitor just took, which reads as an
 * extraction rather than as a blank. The confirm screen has a path for this and
 * it says so in words.
 */
export async function tryAnalyzeReceipt(
  file: File,
): Promise<Sourced<AnalyzeReceiptResponse | null>> {
  try {
    const data = await analyzeReceipt(file, DEMO_EVENT_ID, DEMO_SUBMITTER);
    return { data, source: 'live', reason: null };
  } catch (error) {
    return { data: null, source: 'mock', reason: describe(error) };
  }
}

export async function tryCreateClaim(
  request: CreateClaimRequest,
): Promise<Sourced<CreateClaimResponse | null>> {
  try {
    const data = await createClaim(request);
    return { data, source: 'live', reason: null };
  } catch (error) {
    return { data: null, source: 'mock', reason: describe(error) };
  }
}

export async function tryListClaims(): Promise<Sourced<Claim[]>> {
  try {
    const body = await listClaims(DEMO_EVENT_ID, DEMO_SUBMITTER);
    return { data: body.claims, source: 'live', reason: null };
  } catch (error) {
    return { data: recentClaims, source: 'mock', reason: describe(error) };
  }
}
