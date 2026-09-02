import { describe, expect, it, vi } from 'vitest';

import type { WalletAuthRepository } from '../../../../server/auth/service';
import { createWalletSessionHandlers } from './route';

const address = `0x${'a'.repeat(64)}`;
const expiresAt = '2026-09-01T13:00:00.000Z';
const nowMs = Date.parse('2026-09-01T12:00:00.000Z');

function repository(): WalletAuthRepository {
  return {
    createChallenge: vi.fn(),
    getChallenge: vi.fn(),
    consumeChallenge: vi.fn(),
    findSession: vi.fn(async () => ({ address, expiresAtMs: Date.parse(expiresAt) })),
    revokeSession: vi.fn(),
  };
}

describe('/api/auth/session', () => {
  it('sets an opaque HTTP-only cookie after signature verification', async () => {
    const complete = vi.fn(async () => ({
      session: { address, expiresAt },
      token: 'opaque-token',
    }));
    const handlers = createWalletSessionHandlers({
      complete,
      auth: repository(),
      appOrigin: 'https://tali.example',
      now: () => nowMs,
    });
    const result = await handlers.POST(
      new Request('https://tali.example/api/auth/session', {
        method: 'POST',
        headers: {
          origin: 'https://tali.example',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ challengeId: 'id', signature: 'signature' }),
      }),
    );

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ address, expiresAt });
    expect(result.headers.get('set-cookie')).toContain(
      'tali_session=opaque-token; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600; Secure',
    );
  });

  it('returns the active session without exposing the token', async () => {
    const handlers = createWalletSessionHandlers({
      complete: vi.fn(),
      auth: repository(),
      appOrigin: 'https://tali.example',
      now: () => nowMs,
    });
    const result = await handlers.GET(
      new Request('https://tali.example/api/auth/session', {
        headers: { cookie: 'tali_session=opaque-token' },
      }),
    );

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ address, expiresAt });
  });

  it('revokes the current session, clears its cookie, and enforces origin', async () => {
    const auth = repository();
    const handlers = createWalletSessionHandlers({
      complete: vi.fn(),
      auth,
      appOrigin: 'https://tali.example',
      now: () => nowMs,
    });
    const forbidden = await handlers.DELETE(
      new Request('https://tali.example/api/auth/session', {
        method: 'DELETE',
        headers: { cookie: 'tali_session=opaque-token' },
      }),
    );
    expect(forbidden.status).toBe(403);
    expect(auth.revokeSession).not.toHaveBeenCalled();

    const result = await handlers.DELETE(
      new Request('https://tali.example/api/auth/session', {
        method: 'DELETE',
        headers: {
          origin: 'https://tali.example',
          cookie: 'tali_session=opaque-token',
        },
      }),
    );
    expect(result.status).toBe(204);
    expect(result.headers.get('set-cookie')).toContain('tali_session=;');
    expect(auth.revokeSession).toHaveBeenCalledOnce();
  });
});
