import { describe, expect, it, vi } from 'vitest';

import { createReconcileClaimHandler } from './route';
import { ServerError } from '../../../../../server/errors';

const claimId = '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7';
const treasurer = `0x${'b'.repeat(64)}`;
const digest = '4'.repeat(44);

function request(origin = 'https://tali.example') {
  return new Request(`https://tali.example/api/claims/${claimId}/reconcile`, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
    },
    body: '{}',
  });
}

const context = { params: Promise.resolve({ id: claimId }) };

describe('POST /api/claims/:id/reconcile', () => {
  it('uses the authenticated wallet instead of a submitted identity', async () => {
    const service = vi.fn(async () => ({
      claim: { id: claimId, state: 'paying' },
      status: 'pending' as const,
      digest,
      payment: null,
    }));
    const resolveIdentity = vi.fn(async () => treasurer);
    const handler = createReconcileClaimHandler(
      service as never,
      resolveIdentity,
      'https://tali.example',
    );

    const response = await handler(request(), context);

    expect(response.status).toBe(200);
    expect(service).toHaveBeenCalledWith({ claimId, reconciler: treasurer });
    expect(resolveIdentity).toHaveBeenCalledWith(expect.any(Request), undefined);
  });

  it('rejects a cross-origin reconciliation request', async () => {
    const handler = createReconcileClaimHandler(
      vi.fn() as never,
      vi.fn(async () => treasurer),
      'https://tali.example',
    );

    const response = await handler(request('https://evil.example'), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'origin_forbidden',
      message: 'The request origin is not allowed',
    });
  });

  it('serializes safe reconciliation failures without leaking causes', async () => {
    const handler = createReconcileClaimHandler(
      vi.fn(async () => {
        throw new ServerError(
          'payment_reconciliation_failed',
          502,
          'Sui payment status could not be confirmed',
          { cause: new Error('private RPC endpoint') },
        );
      }) as never,
      vi.fn(async () => treasurer),
      'https://tali.example',
    );

    const response = await handler(request(), context);

    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toContain('Sui payment status could not be confirmed');
    expect(body).not.toContain('private RPC endpoint');
  });
});
