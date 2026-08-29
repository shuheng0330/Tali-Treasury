import type { ListClaimsResponse } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../../server/errors';
import { createListClaimsHandler } from './route';

describe('GET /api/events/:id/claims', () => {
  it('awaits and forwards the dynamic event ID', async () => {
    const serviceResponse: ListClaimsResponse = { claims: [], cursor: null };
    const service = vi.fn(async () => serviceResponse);
    const handler = createListClaimsHandler(service);

    const result = await handler(
      new Request('http://localhost/api/events/event-id/claims'),
      { params: Promise.resolve({ id: 'event-id' }) },
    );

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual(serviceResponse);
    expect(service).toHaveBeenCalledWith('event-id');
  });

  it('maps service errors to the shared API error shape', async () => {
    const handler = createListClaimsHandler(
      vi.fn(async () => {
        throw new ServerError('invalid_request', 400, 'Invalid event ID');
      }),
    );

    const result = await handler(
      new Request('http://localhost/api/events/bad/claims'),
      { params: Promise.resolve({ id: 'bad' }) },
    );

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toEqual({
      error: 'invalid_request',
      message: 'Invalid event ID',
    });
  });
});
