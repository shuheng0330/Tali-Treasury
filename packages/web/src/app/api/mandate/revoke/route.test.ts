import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../server/errors';
import { createRevokeHandler } from './route';

const employer = `0x${'a'.repeat(64)}`;
const origin = 'https://tali-treasury.vercel.app';
const validConfirmation = {
  confirm: 'Orientation Week',
  expected: 'Orientation Week',
};

function request(body: unknown, requestOrigin = origin) {
  return new Request(`${origin}/api/mandate/revoke`, {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function handler(input?: {
  address?: string;
  requestOrigin?: string;
  env?: Record<string, string | undefined>;
  authenticationError?: boolean;
}) {
  const revoke = vi.fn(async () => ({ status: 'revoked' as const, digest: 'digest' }));
  const resolveIdentity = vi.fn(async () => {
    if (input?.authenticationError) {
      throw new ServerError(
        'authentication_required',
        401,
        'A valid wallet session is required',
      );
    }
    return input?.address ?? employer;
  });
  const execute = createRevokeHandler({
    revoke,
    resolveIdentity,
    appOrigin: origin,
    env: input?.env ?? { TALI_EMPLOYER_WALLET: employer },
  });
  return {
    execute: (body: unknown = validConfirmation) =>
      execute(request(body, input?.requestOrigin)),
    resolveIdentity,
    revoke,
  };
}

describe('mandate revoke authorization', () => {
  it('revokes for the configured employer after typed confirmation', async () => {
    const { execute, revoke } = handler();

    expect((await execute()).status).toBe(200);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('rejects another wallet without revoking', async () => {
    const { execute, revoke } = handler({ address: `0x${'b'.repeat(64)}` });

    expect((await execute()).status).toBe(403);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('rejects a foreign origin before session lookup', async () => {
    const { execute, resolveIdentity, revoke } = handler({
      requestOrigin: 'https://evil.example',
    });

    expect((await execute()).status).toBe(403);
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('requires an authenticated wallet session', async () => {
    const { execute, revoke } = handler({ authenticationError: true });

    expect((await execute()).status).toBe(401);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('fails closed without employer configuration', async () => {
    const { execute, revoke } = handler({ env: {} });

    expect((await execute()).status).toBe(503);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('retains the typed-confirmation requirement', async () => {
    const { execute, revoke } = handler();

    expect(
      (await execute({ confirm: 'Wrong event', expected: 'Orientation Week' })).status,
    ).toBe(400);
    expect(revoke).not.toHaveBeenCalled();
  });
});
