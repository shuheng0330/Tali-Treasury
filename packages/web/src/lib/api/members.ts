import type { CreateEventMemberResponse } from '@tali/shared';

import { TaliApiError, responseJson } from './client';

export interface AddEventMemberInput {
  walletAddress: string;
  displayName: string;
}

export type AddMemberOutcome =
  | { kind: 'added'; walletAddress: string; displayName: string }
  | { kind: 'unavailable'; reason: string };

function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the backend is unreachable';
  }
  if (error.status === 404) {
    return error.message || 'the event was not found';
  }
  if (error.code === 'authentication_required') {
    return 'sign in with the treasurer wallet';
  }
  return error.message;
}

/** POST /api/events/:eventId/members — authenticated treasurer only. */
export async function tryAddEventMember(
  eventId: string,
  input: AddEventMemberInput,
): Promise<AddMemberOutcome> {
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: input.walletAddress, displayName: input.displayName }),
    });
    const result = await responseJson<CreateEventMemberResponse>(response);
    return {
      kind: 'added',
      walletAddress: result.member.address,
      displayName: result.member.displayName,
    };
  } catch (error) {
    return { kind: 'unavailable', reason: describe(error) };
  }
}
