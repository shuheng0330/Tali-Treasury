import { describe, expect, it, vi } from 'vitest';

import { authorizeEmployerRequest, requireEmployerWallet } from './authorization';

const employer = `0x${'a'.repeat(64)}`;
const outsider = `0x${'b'.repeat(64)}`;
const origin = 'https://tali-treasury.vercel.app';

function request(requestOrigin = origin) {
  return new Request(`${origin}/api/payroll/runs`, {
    method: 'POST',
    headers: { origin: requestOrigin },
  });
}

describe('requireEmployerWallet', () => {
  it('returns a canonical configured employer address', () => {
    expect(requireEmployerWallet({ TALI_EMPLOYER_WALLET: employer })).toBe(employer);
  });

  it.each([undefined, '', '0x1234', `0x${'A'.repeat(64)}`])(
    'fails closed for malformed configuration %s',
    (value) => {
      expect(() => requireEmployerWallet({ TALI_EMPLOYER_WALLET: value })).toThrow(
        expect.objectContaining({
          code: 'authorization_configuration_failed',
          status: 503,
        }),
      );
    },
  );
});

describe('authorizeEmployerRequest', () => {
  it('returns the authenticated configured employer', async () => {
    await expect(
      authorizeEmployerRequest({
        request: request(),
        appOrigin: origin,
        resolveIdentity: vi.fn(async () => employer),
        env: { TALI_EMPLOYER_WALLET: employer },
      }),
    ).resolves.toBe(employer);
  });

  it('rejects another authenticated wallet', async () => {
    await expect(
      authorizeEmployerRequest({
        request: request(),
        appOrigin: origin,
        resolveIdentity: vi.fn(async () => outsider),
        env: { TALI_EMPLOYER_WALLET: employer },
      }),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('checks origin before resolving identity', async () => {
    const resolveIdentity = vi.fn(async () => employer);

    await expect(
      authorizeEmployerRequest({
        request: request('https://evil.example'),
        appOrigin: origin,
        resolveIdentity,
        env: { TALI_EMPLOYER_WALLET: employer },
      }),
    ).rejects.toMatchObject({ code: 'origin_forbidden', status: 403 });
    expect(resolveIdentity).not.toHaveBeenCalled();
  });
});
