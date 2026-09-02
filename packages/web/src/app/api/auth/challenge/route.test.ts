import type { CreateWalletChallengeResponse } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { createWalletChallengeHandler } from './route';

describe('POST /api/auth/challenge', () => {
  it('requires the configured origin and returns the challenge', async () => {
    const response: CreateWalletChallengeResponse = {
      challengeId: '32222222-2222-4222-8222-222222222222',
      message: 'Sign in. No transaction will be sent.',
      expiresAt: '2026-09-01T12:05:00.000Z',
    };
    const issue = vi.fn(async () => response);
    const handler = createWalletChallengeHandler(issue, 'https://tali.example');
    const request = new Request('https://tali.example/api/auth/challenge', {
      method: 'POST',
      headers: {
        origin: 'https://tali.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ address: `0x${'a'.repeat(64)}` }),
    });

    const result = await handler(request);
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual(response);
    expect(issue).toHaveBeenCalledWith({ address: `0x${'a'.repeat(64)}` });
  });

  it('rejects a missing origin without issuing a challenge', async () => {
    const issue = vi.fn();
    const handler = createWalletChallengeHandler(issue, 'https://tali.example');
    const result = await handler(
      new Request('https://tali.example/api/auth/challenge', {
        method: 'POST',
        body: '{}',
      }),
    );

    expect(result.status).toBe(403);
    await expect(result.json()).resolves.toMatchObject({ error: 'origin_forbidden' });
    expect(issue).not.toHaveBeenCalled();
  });
});
