import { TaliApiError, responseJson } from '@/lib/api/client';

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
    return 'member management is not live yet';
  }
  if (error.code === 'authentication_required') {
    return 'the demo identity API is switched off';
  }
  return error.message;
}

/**
 * POST /api/events/:eventId/members — treasurer-only, not yet built server
 * side (see docs/LAUNCH_PLAN.md, Tier 3a). This already calls the real path,
 * so the screen needs no change once it ships; until then every attempt
 * resolves to 'unavailable' with a plain reason rather than throwing.
 */
export async function tryAddEventMember(
  eventId: string,
  input: AddEventMemberInput,
): Promise<AddMemberOutcome> {
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = await responseJson<{ walletAddress: string; displayName: string }>(
      response,
    );
    return {
      kind: 'added',
      walletAddress: result.walletAddress,
      displayName: result.displayName,
    };
  } catch (error) {
    return { kind: 'unavailable', reason: describe(error) };
  }
}
