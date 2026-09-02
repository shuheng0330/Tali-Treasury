import type { ReviewClaimResponse } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../../server/errors';
import { createReviewClaimHandler } from './route';

const claimId = '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7';
const reviewer = `0x${'b'.repeat(64)}`;
const response = {
  claim: { id: claimId, state: 'rejected' },
  recorded: true,
} as ReviewClaimResponse;
const context = { params: Promise.resolve({ id: claimId }) };

function request(body: string) {
  return new Request(`http://localhost/api/claims/${claimId}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/claims/:id/review', () => {
  it('forwards the claim ID and review payload', async () => {
    const service = vi.fn(async () => response);
    const handler = createReviewClaimHandler(service);
    const payload = { action: 'reject', reviewer, reason: 'Duplicate expense' };

    const result = await handler(request(JSON.stringify(payload)), context);

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual(response);
    expect(service).toHaveBeenCalledWith({ claimId, ...payload });
  });

  it.each(['{bad', JSON.stringify({ action: 'reject' })])(
    'rejects invalid request input without calling the service',
    async (body) => {
      const service = vi.fn();
      const result = await createReviewClaimHandler(service)(request(body), context);

      expect(result.status).toBe(400);
      await expect(result.json()).resolves.toMatchObject({ error: 'invalid_request' });
      expect(service).not.toHaveBeenCalled();
    },
  );

  it('serializes a safe reviewer authorization error', async () => {
    const handler = createReviewClaimHandler(async () => {
      throw new ServerError(
        'reviewer_forbidden',
        403,
        'Only the event treasurer may review claims',
        { cause: new Error('private database detail') },
      );
    });

    const result = await handler(
      request(JSON.stringify({ action: 'approve', reviewer })),
      context,
    );
    const text = await result.text();

    expect(result.status).toBe(403);
    expect(JSON.parse(text)).toEqual({
      error: 'reviewer_forbidden',
      message: 'Only the event treasurer may review claims',
    });
    expect(text).not.toContain('private database detail');
  });
});
