import type { OvertimeClaim, OvertimeKind } from '@tali/shared';
import { TaliApiError, responseJson } from '@/lib/api/client';
import type { Sourced } from '@/lib/api/demo';

/**
 * What a photographed timesheet was read as.
 *
 * Every field is nullable because a timesheet may show one of them and not the
 * others, and `uncertain` names the ones to highlight. There is no confidence
 * figure: it is a server-side routing threshold and does not reach the DOM.
 */
export interface OvertimeDraft {
  workedOn: string | null;
  kind: OvertimeKind | null;
  hours: string | null;
  note: string;
  uncertain: string[];
}

export interface ListOvertimeResponse {
  claims: OvertimeClaim[];
  /** False when the claims are held in memory rather than written down. */
  persisted: boolean;
  reason: string | null;
}

export interface SubmitOvertimeRequest {
  workedOn: string;
  kind: OvertimeKind;
  hours: string;
  reason: string;
}

export type OvertimeReviewAction = 'approve' | 'reject';

/** One short clause fit for the middle of a banner sentence. */
function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the overtime API is unreachable';
  }

  if (error.code === 'authentication_required') {
    return 'wallet sign-in is required';
  }
  return error.message.charAt(0).toLowerCase() + error.message.slice(1);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return responseJson<T>(
    await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export interface OvertimeListing extends Sourced<OvertimeClaim[]> {
  /**
   * Whether the API answered at all. A store that is only remembering still
   * holds the employee's real claims; a request that never landed holds
   * nothing, and the two cannot be described with the same sentence.
   */
  reached: boolean;
}

export async function tryListOvertime(): Promise<OvertimeListing> {
  try {
    const body = await responseJson<ListOvertimeResponse>(
      await fetch('/api/overtime', { cache: 'no-store' }),
    );
    return {
      data: body.claims,
      source: body.persisted ? 'live' : 'mock',
      reason: body.persisted ? null : body.reason,
      reached: true,
    };
  } catch (error) {
    return { data: [], source: 'mock', reason: describe(error), reached: false };
  }
}

export async function trySubmitOvertime(
  request: SubmitOvertimeRequest,
): Promise<Sourced<OvertimeClaim | null>> {
  try {
    const body = await post<{ claim: OvertimeClaim }>('/api/overtime', request);
    return { data: body.claim, source: 'live', reason: null };
  } catch (error) {
    return { data: null, source: 'mock', reason: describe(error) };
  }
}

export async function tryReviewOvertime(
  claimId: string,
  action: OvertimeReviewAction,
  reason?: string,
): Promise<Sourced<OvertimeClaim | null>> {
  try {
    const body = await post<{ claim: OvertimeClaim }>(
      `/api/overtime/${encodeURIComponent(claimId)}/review`,
      reason === undefined ? { action } : { action, reason },
    );
    return { data: body.claim, source: 'live', reason: null };
  } catch (error) {
    return { data: null, source: 'mock', reason: describe(error) };
  }
}

/** 32KB at a time, because spreading a whole image into `fromCharCode` overflows the stack. */
const CHUNK = 0x8000;

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

/**
 * Null data means the timesheet was not read.
 *
 * It deliberately does not fall back to a sample draft: prefilling a form with
 * invented hours beside the photograph somebody just took reads as an
 * extraction rather than as a blank, and these hours become wages.
 */
export async function tryAnalyzeTimesheet(file: File): Promise<Sourced<OvertimeDraft | null>> {
  try {
    const body = await post<{ draft: OvertimeDraft }>('/api/overtime/analyze', {
      imageBase64: await toBase64(file),
      mimeType: file.type,
    });
    return { data: body.draft, source: 'live', reason: null };
  } catch (error) {
    return { data: null, source: 'mock', reason: describe(error) };
  }
}
