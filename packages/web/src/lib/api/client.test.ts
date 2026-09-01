import type {
  AnalyzeReceiptResponse,
  ProcessClaimResponse,
  ReviewClaimResponse,
} from '@tali/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyzeReceipt, listClaims, processClaim, reviewClaim } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('claim API client', () => {
  it('uploads the receipt with the event and submitter identity', async () => {
    const response = {
      analysis: { receiptHash: 'a'.repeat(64) },
      storagePath: `event/${'a'.repeat(64)}.png`,
      duplicateOf: null,
    } as AnalyzeReceiptResponse;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(response),
    );
    vi.stubGlobal('fetch', fetchMock);

    const receipt = new File(['receipt'], 'receipt.png', { type: 'image/png' });
    await expect(analyzeReceipt(receipt, 'event-id', '0xmember')).resolves.toEqual(response);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/receipts/analyze');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('eventId')).toBe('event-id');
    expect((init?.body as FormData).get('submitter')).toBe('0xmember');
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

    await expect(listClaims('event-id', '0xmember')).rejects.toMatchObject({
      code: 'authentication_required',
      status: 503,
      message: 'Wallet authentication required',
    });
  });

  it('encodes the viewer when listing claims', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ claims: [], cursor: null }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listClaims('event/id', '0xmember+one');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/events/event%2Fid/claims?viewer=0xmember%2Bone',
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

    await expect(processClaim('claim/id', '0xtreasurer')).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/claims/claim%2Fid/process', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ processor: '0xtreasurer' }),
    });
  });

  it('submits a typed treasurer review action', async () => {
    const response = {
      claim: { id: 'claim-id', state: 'needs_correction' },
      payment: null,
    } as ReviewClaimResponse;
    const fetchMock = vi.fn(async () => Response.json(response));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      reviewClaim('claim/id', {
        action: 'request_correction',
        reviewer: '0xtreasurer',
        reason: 'Upload the full receipt',
      }),
    ).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/claims/claim%2Fid/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'request_correction',
        reviewer: '0xtreasurer',
        reason: 'Upload the full receipt',
      }),
    });
  });
});
