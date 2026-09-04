import { TaliApiError, responseJson } from '@/lib/api/client';

export type RegistrationOutcome =
  | { kind: 'registered'; mandateId: string; capId: string }
  | { kind: 'refused'; message: string }
  | { kind: 'unavailable'; reason: string };

function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the backend is unreachable';
  }
  if (error.status === 404) {
    return 'this deployment has no payroll registration endpoint yet';
  }
  if (error.code === 'authentication_required') {
    return 'the wallet session was not accepted';
  }
  return error.message.charAt(0).toLowerCase() + error.message.slice(1);
}

/**
 * Registers a payroll mandate that is already funded on chain.
 *
 * Only the digest is sent. The mandate id, capability owner, employer,
 * employee and policy are all readable from the finalized transaction, and a
 * server that trusted the browser for them would register a mandate nobody
 * created. This is the request shape the endpoint should keep when it exists.
 *
 * Separating this from signing is the point: the transaction is the expensive,
 * irreversible half, so a registration that fails has to be retryable on its
 * own. Re-running the whole flow would fund a second mandate.
 */
export async function tryRegisterPayroll(digest: string): Promise<RegistrationOutcome> {
  try {
    const response = await fetch('/api/payroll/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ digest }),
    });
    const result = await responseJson<
      | { status: 'registered'; mandateId: string; capId: string }
      | { status: 'refused'; message: string }
    >(response);
    return result.status === 'registered'
      ? { kind: 'registered', mandateId: result.mandateId, capId: result.capId }
      : { kind: 'refused', message: result.message };
  } catch (error) {
    return { kind: 'unavailable', reason: describe(error) };
  }
}
