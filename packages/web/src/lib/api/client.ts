import type {
  AnalyzeReceiptResponse,
  ApiError,
  CreateClaimRequest,
  CreateClaimResponse,
  CreateWalletChallengeResponse,
  GetWalletSessionResponse,
  ListClaimsResponse,
  ProcessClaimRequest,
  ProcessClaimResponse,
  ReviewClaimRequest,
  ReviewClaimResponse,
} from '@tali/shared';
import { isApiError } from '@tali/shared';

/**
 * Transport only: every function here throws a typed error and knows nothing
 * about the app. The forgiving wrappers bound to the demo identity live in
 * ./demo, which is what the screens use.
 */
export class TaliApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'TaliApiError';
  }
}

export async function responseJson<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new TaliApiError(
      'The server returned an unreadable response',
      'invalid_response',
      response.status,
    );
  }

  if (!response.ok) {
    const error: ApiError = isApiError(body)
      ? body
      : { error: 'request_failed', message: 'The request failed' };
    throw new TaliApiError(error.message, error.error, response.status, error.detail);
  }

  return body as T;
}

export async function analyzeReceipt(
  receipt: File,
  eventId: string,
): Promise<AnalyzeReceiptResponse> {
  const form = new FormData();
  form.set('receipt', receipt);
  form.set('eventId', eventId);

  return responseJson<AnalyzeReceiptResponse>(
    await fetch('/api/receipts/analyze', { method: 'POST', body: form }),
  );
}

export async function createClaim(
  request: CreateClaimRequest,
): Promise<CreateClaimResponse> {
  return responseJson<CreateClaimResponse>(
    await fetch('/api/claims', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    }),
  );
}

export async function listClaims(
  eventId: string,
): Promise<ListClaimsResponse> {
  return responseJson<ListClaimsResponse>(
    await fetch(`/api/events/${encodeURIComponent(eventId)}/claims`, {
      cache: 'no-store',
    }),
  );
}

export async function processClaim(
  claimId: string,
): Promise<ProcessClaimResponse> {
  const request: ProcessClaimRequest = {};
  return responseJson<ProcessClaimResponse>(
    await fetch(`/api/claims/${encodeURIComponent(claimId)}/process`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    }),
  );
}

export async function issueWalletChallenge(
  address: string,
): Promise<CreateWalletChallengeResponse> {
  return responseJson<CreateWalletChallengeResponse>(
    await fetch('/api/auth/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address }),
    }),
  );
}

export async function createWalletSession(
  challengeId: string,
  signature: string,
): Promise<GetWalletSessionResponse> {
  return responseJson<GetWalletSessionResponse>(
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, signature }),
    }),
  );
}

export async function getWalletSession(): Promise<GetWalletSessionResponse> {
  return responseJson<GetWalletSessionResponse>(
    await fetch('/api/auth/session', { cache: 'no-store' }),
  );
}

export async function deleteWalletSession(): Promise<void> {
  const response = await fetch('/api/auth/session', { method: 'DELETE' });
  if (!response.ok) await responseJson<never>(response);
}

export async function reviewClaim(
  claimId: string,
  request: ReviewClaimRequest,
): Promise<ReviewClaimResponse> {
  return responseJson<ReviewClaimResponse>(
    await fetch(`/api/claims/${encodeURIComponent(claimId)}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    }),
  );
}
