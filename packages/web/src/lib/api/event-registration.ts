import type { ExpenseCategory } from '@tali/shared';
import { TaliApiError, responseJson } from '@/lib/api/client';

export interface RegisterEventRequest {
  digest: string;
  name: string;
  organisation: string;
  allowedCategories: ExpenseCategory[];
}

export type EventRegistrationOutcome =
  | { kind: 'registered'; eventId: string; mandateId: string }
  | { kind: 'refused'; message: string }
  | { kind: 'unavailable'; reason: string };

function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the backend is unreachable';
  }
  if (error.status === 404) {
    return 'this deployment has no event registration endpoint yet';
  }
  if (error.code === 'authentication_required') {
    return 'the wallet session was not accepted';
  }
  return error.message.charAt(0).toLowerCase() + error.message.slice(1);
}

/**
 * Registers an expense mandate that is already funded on chain.
 *
 * The digest is the only thing the server should trust for chain facts: the
 * mandate id, cap owners, budget, cap, expiry and allowlist are all readable
 * from the finalized transaction. Name, organisation and categories are sent
 * because they exist nowhere else — they are event metadata, not chain state,
 * and the server has no other source for them.
 *
 * Kept separate from signing so a failed registration can be retried on its
 * own. Repeating the whole flow would fund a second mandate.
 */
export async function tryRegisterEvent(
  request: RegisterEventRequest,
): Promise<EventRegistrationOutcome> {
  try {
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    const result = await responseJson<
      | { status: 'registered'; eventId: string; mandateId: string }
      | { status: 'refused'; message: string }
    >(response);
    return result.status === 'registered'
      ? { kind: 'registered', eventId: result.eventId, mandateId: result.mandateId }
      : { kind: 'refused', message: result.message };
  } catch (error) {
    return { kind: 'unavailable', reason: describe(error) };
  }
}
