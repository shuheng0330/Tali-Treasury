import type { CreateClaimResponse } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { createClaimHandler } from './route';

describe('POST /api/claims', () => {
  it('replaces any submitted identity with the authenticated wallet', async () => {
    const wallet = `0x${'a'.repeat(64)}`;
    const serviceResponse = { claim: { id: 'claim-id' } } as CreateClaimResponse;
    const service = vi.fn(async () => serviceResponse);
    const handler = createClaimHandler(
      service,
      vi.fn(async () => wallet),
      'https://tali.example',
    );
    const result = await handler(
      new Request('https://tali.example/api/claims', {
        method: 'POST',
        headers: {
          origin: 'https://tali.example',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          draftId: '11111111-1111-4111-8111-111111111111',
          submitter: `0x${'f'.repeat(64)}`,
          amount: '1',
        }),
      }),
    );

    expect(result.status).toBe(201);
    expect(service).toHaveBeenCalledWith({
      draftId: '11111111-1111-4111-8111-111111111111',
      amount: '1',
      submitter: wallet,
    });
  });

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
