import type { CreateClaimResponse } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { createClaimHandler } from './route';

describe('POST /api/claims', () => {
  it('forwards parsed JSON and returns the service response', async () => {
    const body = { eventId: 'event-input' };
    const serviceResponse = { claim: { id: 'claim-id' } } as CreateClaimResponse;
    const service = vi.fn(async () => serviceResponse);
    const handler = createClaimHandler(service);

    const result = await handler(
      new Request('http://localhost/api/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

    expect(result.status).toBe(201);
    await expect(result.json()).resolves.toEqual(serviceResponse);
    expect(service).toHaveBeenCalledWith(body);
  });

  it('returns invalid_request for malformed JSON without calling the service', async () => {
    const service = vi.fn();
    const handler = createClaimHandler(service);
    const result = await handler(
      new Request('http://localhost/api/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toMatchObject({ error: 'invalid_request' });
    expect(service).not.toHaveBeenCalled();
  });
});
