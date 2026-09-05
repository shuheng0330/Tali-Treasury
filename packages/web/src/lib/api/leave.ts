import type { LeaveKind, LeaveRequest } from '@tali/shared';
import { TaliApiError, responseJson } from '@/lib/api/client';
import type { Sourced } from '@/lib/api/demo';

export interface ListLeaveResponse {
  requests: LeaveRequest[];
  /** False when the requests are held in memory rather than written down. */
  persisted: boolean;
  reason: string | null;
}

export interface SubmitLeaveRequest {
  startOn: string;
  endOn: string;
  days: string;
  kind: LeaveKind;
  reason: string;
}

/** One short clause fit for the middle of a banner sentence. */
function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the leave API is unreachable';
  }

  if (error.code === 'authentication_required') {
    return 'wallet sign-in is required';
  }
  return error.message.charAt(0).toLowerCase() + error.message.slice(1);
}

export interface LeaveListing extends Sourced<LeaveRequest[]> {
  /**
   * Whether the API answered at all. A store that is only remembering still
   * holds the employee's real requests; a request that never landed holds
   * nothing, and the two cannot be described with the same sentence.
   */
  reached: boolean;
}

export async function tryListLeave(): Promise<LeaveListing> {
  try {
    const body = await responseJson<ListLeaveResponse>(
      await fetch('/api/leave', { cache: 'no-store' }),
    );
    return {
      data: body.requests,
      source: body.persisted ? 'live' : 'mock',
      reason: body.persisted ? null : body.reason,
      reached: true,
    };
  } catch (error) {
    return { data: [], source: 'mock', reason: describe(error), reached: false };
  }
}

export async function trySubmitLeave(
  request: SubmitLeaveRequest,
): Promise<Sourced<LeaveRequest | null>> {
  try {
    const body = await responseJson<{ request: LeaveRequest }>(
      await fetch('/api/leave', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }),
    );
    return { data: body.request, source: 'live', reason: null };
  } catch (error) {
    return { data: null, source: 'mock', reason: describe(error) };
  }
}
