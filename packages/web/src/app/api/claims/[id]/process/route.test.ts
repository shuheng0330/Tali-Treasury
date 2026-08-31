import type { ProcessClaimResponse } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../../server/errors';
import { createProcessClaimHandler } from './route';

const claimId = '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7';
const processor = `0x${'b'.repeat(64)}`;
const response = {
  claim: { id: claimId },
  decision: { outcome: 'auto_pay' },
  payment: null,
} as ProcessClaimResponse;

function request(body: string) {
  return new Request(`http://localhost/api/claims/${claimId}/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

const context = { params: Promise.resolve({ id: claimId }) };

describe('POST /api/claims/:id/process', () => {
  it('forwards the claim ID and processor to the service', async () => {
    const service = vi.fn(async () => response);
    const handler = createProcessClaimHandler(service);

    const result = await handler(
      request(JSON.stringify({ processor })),
      context,
    );

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual(response);
    expect(service).toHaveBeenCalledWith({ claimId, processor });
  });

  it('rejects malformed JSON without calling the service', async () => {
    const service = vi.fn();
    const handler = createProcessClaimHandler(service);

    const result = await handler(request('{bad'), context);

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toMatchObject({
      error: 'invalid_request',
    });
    expect(service).not.toHaveBeenCalled();
  });

  it('requires a processor string before calling the service', async () => {
    const service = vi.fn();
    const handler = createProcessClaimHandler(service);

    const result = await handler(request(JSON.stringify({})), context);

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toMatchObject({
      error: 'invalid_request',
    });
    expect(service).not.toHaveBeenCalled();
  });

  it('maps safe service errors to the API response', async () => {
    const service = vi.fn(async () => {
      throw new ServerError(
        'processor_forbidden',
        403,
        'Only the event treasurer may process claims',
      );
    });
    const handler = createProcessClaimHandler(service);

    const result = await handler(
      request(JSON.stringify({ processor })),
      context,
    );

    expect(result.status).toBe(403);
    await expect(result.json()).resolves.toEqual({
      error: 'processor_forbidden',
      message: 'Only the event treasurer may process claims',
    });
  });
});
