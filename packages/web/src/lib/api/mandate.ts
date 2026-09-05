import { TaliApiError, responseJson } from '@/lib/api/client';

export type RevokeOutcome =
  | { kind: 'revoked'; digest: string }
  | { kind: 'refused'; message: string }
  | { kind: 'unavailable'; reason: string };

function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the backend is unreachable';
  }
  if (error.code === 'authentication_required') {
    return 'wallet authentication is required';
  }
  /* Rendered as its own sentence, unlike the banner text elsewhere, so the
     server's capitalisation is kept. */
  return error.message;
}

export async function tryRevokeMandate(input: {
  confirm: string;
  expected: string;
}): Promise<RevokeOutcome> {
  try {
    const response = await fetch('/api/mandate/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = await responseJson<
      { status: 'revoked'; digest: string } | { status: 'refused'; message: string }
    >(response);
    return result.status === 'revoked'
      ? { kind: 'revoked', digest: result.digest }
      : { kind: 'refused', message: result.message };
  } catch (error) {
    return { kind: 'unavailable', reason: describe(error) };
  }
}
