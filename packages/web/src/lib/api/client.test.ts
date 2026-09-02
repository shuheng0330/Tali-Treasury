import type {
  AnalyzeReceiptResponse,
  ProcessClaimResponse,
  ReviewClaimResponse,
} from '@tali/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeReceipt,
  createWalletSession,
  deleteWalletSession,
  issueWalletChallenge,
  listClaims,
  processClaim,
  reviewClaim,
} from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('wallet session API client', () => {
  it('sends the challenge and signature payloads without exposing a session token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ challengeId: 'challenge-id', message: 'Sign in', expiresAt: 'soon' }),
      )
      .mockResolvedValueOnce(
        Response.json({ address: `0x${'a'.repeat(64)}`, expiresAt: 'later' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await issueWalletChallenge(`0x${'a'.repeat(64)}`);
    await createWalletSession('challenge-id', 'wallet-signature');

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ address: `0x${'a'.repeat(64)}` }),
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ challengeId: 'challenge-id', signature: 'wallet-signature' }),
    });
  });

  it('logs out without expecting a JSON body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteWalletSession()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', { method: 'DELETE' });
  });
});

describe('claim API client', () => {
  it('uploads the receipt with the event but no client-supplied identity', async () => {
    const response = {
      analysis: { receiptHash: 'a'.repeat(64) },
      draftId: '11111111-1111-4111-8111-111111111111',
      draftExpiresAt: '2026-09-01T12:15:00.000Z',
      duplicateOf: null,
    } as AnalyzeReceiptResponse;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(response),
    );
    vi.stubGlobal('fetch', fetchMock);

    const receipt = new File(['receipt'], 'receipt.png', { type: 'image/png' });
    await expect(analyzeReceipt(receipt, 'event-id')).resolves.toEqual(response);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/receipts/analyze');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('eventId')).toBe('event-id');
    expect((init?.body as FormData).has('submitter')).toBe(false);
  });

  it('surfaces structured API failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'authentication_required', message: 'Wallet authentication required' },
          { status: 503 },
        ),
      ),
    );

    await expect(listClaims('event-id')).rejects.toMatchObject({
      code: 'authentication_required',
      status: 503,
      message: 'Wallet authentication required',
    });
  });

  it('encodes the event without a viewer query parameter', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ claims: [], cursor: null }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listClaims('event/id');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/events/event%2Fid/claims',
      { cache: 'no-store' },
    );
  });

  it('processes a claim through the server policy endpoint', async () => {
    const response = {
      claim: { id: 'claim-id' },
      decision: { outcome: 'review' },
      payment: null,
    } as ProcessClaimResponse;
    const fetchMock = vi.fn(async () => Response.json(response));
    vi.stubGlobal('fetch', fetchMock);

    await expect(processClaim('claim/id')).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/claims/claim%2Fid/process', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
  });

  it('submits a typed treasurer review action', async () => {
    const response = {
      claim: { id: 'claim-id', state: 'needs_correction' },
      recorded: true,
    } as ReviewClaimResponse;
    const fetchMock = vi.fn(async () => Response.json(response));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      reviewClaim('claim/id', {
        action: 'request_correction',
        reason: 'Upload the full receipt',
      }),
    ).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/claims/claim%2Fid/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'request_correction',
        reason: 'Upload the full receipt',
      }),
    });
  });
});
