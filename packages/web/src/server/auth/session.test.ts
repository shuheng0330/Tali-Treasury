import { describe, expect, it, vi } from 'vitest';

import { hashSessionToken, type WalletAuthRepository } from './service';
import {
  assertSameOrigin,
  clearSessionCookie,
  createSessionCookie,
  resolveWalletIdentity,
  revokeWalletSession,
} from './session';

const address = `0x${'a'.repeat(64)}`;
const nowMs = Date.parse('2026-09-01T12:00:00Z');

function repository(): WalletAuthRepository {
  return {
    createChallenge: vi.fn(),
    getChallenge: vi.fn(),
    consumeChallenge: vi.fn(),
    findSession: vi.fn(),
    revokeSession: vi.fn(),
  };
}

describe('wallet session cookies', () => {
  it('uses strict HTTP-only cookies and Secure for an HTTPS origin', () => {
    expect(
      createSessionCookie({
        token: 'opaque-token',
        expiresAtMs: nowMs + 3_600_000,
        appOrigin: 'https://tali.example',
      }),
    ).toBe(
      'tali_session=opaque-token; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600; Secure',
    );
  });

  it('omits Secure for a local HTTP origin and clears only the session cookie', () => {
    expect(
      createSessionCookie({
        token: 'opaque-token',
        expiresAtMs: nowMs + 3_600_000,
        appOrigin: 'http://localhost:3000',
      }),
    ).not.toContain('Secure');
    expect(clearSessionCookie('http://localhost:3000')).toBe(
      'tali_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
    );
  });
});

describe('same-origin enforcement', () => {
  it('accepts only the exact configured Origin header', () => {
    expect(() =>
      assertSameOrigin(
        new Request('https://tali.example/api/auth/session', {
          headers: { origin: 'https://tali.example' },
        }),
        'https://tali.example',
      ),
    ).not.toThrow();

    for (const origin of [null, 'https://evil.example', 'https://tali.example.evil']) {
      const headers = origin ? { origin } : undefined;
      expect(() =>
        assertSameOrigin(
          new Request('https://tali.example/api/auth/session', { headers }),
          'https://tali.example',
        ),
      ).toThrowError(
        expect.objectContaining({ code: 'origin_forbidden', status: 403 }),
      );
    }
  });
});

describe('wallet identity resolution', () => {
  it('resolves a valid opaque cookie through its SHA-256 hash', async () => {
    const auth = repository();
    vi.mocked(auth.findSession).mockResolvedValue({
      address,
      expiresAtMs: nowMs + 60_000,
    });

    await expect(
      resolveWalletIdentity({
        request: new Request('https://tali.example/api/claims', {
          headers: { cookie: 'other=x; tali_session=opaque-token; theme=dark' },
        }),
        auth,
        nowMs,
        env: {},
      }),
    ).resolves.toEqual({
      address,
      expiresAt: '2026-09-01T12:01:00.000Z',
      source: 'session',
    });
    expect(auth.findSession).toHaveBeenCalledWith(
      hashSessionToken('opaque-token'),
      nowMs,
    );
  });

  it('does not fall back when a cookie is present but invalid', async () => {
    const auth = repository();
    vi.mocked(auth.findSession).mockResolvedValue(null);

    await expect(
      resolveWalletIdentity({
        request: new Request('http://localhost/api/claims', {
          headers: { cookie: 'tali_session=expired-token' },
        }),
        auth,
        nowMs,
        legacyAddress: address,
        env: { TALI_ALLOW_INSECURE_DEMO_IDENTITY: 'true' },
      }),
    ).rejects.toMatchObject({ code: 'authentication_required', status: 401 });
  });

  it('uses the local demo identity only when no session cookie exists', async () => {
    const auth = repository();
    await expect(
      resolveWalletIdentity({
        request: new Request('http://localhost/api/claims'),
        auth,
        nowMs,
        legacyAddress: address,
        env: { TALI_ALLOW_INSECURE_DEMO_IDENTITY: 'true' },
      }),
    ).resolves.toEqual({ address, expiresAt: null, source: 'demo' });
    expect(auth.findSession).not.toHaveBeenCalled();
  });

  it('rejects a missing cookie when demo identity is disabled', async () => {
    await expect(
      resolveWalletIdentity({
        request: new Request('https://tali.example/api/claims'),
        auth: repository(),
        nowMs,
        legacyAddress: address,
        env: { TALI_ALLOW_INSECURE_DEMO_IDENTITY: 'false' },
      }),
    ).rejects.toMatchObject({ code: 'authentication_required', status: 401 });
  });

  it('revokes only the token in the current cookie', async () => {
    const auth = repository();
    await revokeWalletSession({
      request: new Request('https://tali.example/api/auth/session', {
        headers: { cookie: 'tali_session=opaque-token' },
      }),
      auth,
      nowMs,
    });
    expect(auth.revokeSession).toHaveBeenCalledWith(
      hashSessionToken('opaque-token'),
      nowMs,
    );
  });
});
