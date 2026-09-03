import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../server/errors';
import { createSafetyAttackHandler } from './route';

const employer = `0x${'a'.repeat(64)}`;
const origin = 'https://tali-treasury.vercel.app';
const attack = {
  attack: 'overspend' as const,
  amount: '1000000',
  recipient: `0x${'b'.repeat(64)}`,
};

function request(body: unknown = attack, requestOrigin = origin) {
  return new Request(`${origin}/api/safety/attack`, {
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
  const submitAttack = vi.fn(async () => ({ digest: 'digest', payment: null }));
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
  const execute = createSafetyAttackHandler({
    submitAttack,
    resolveIdentity,
    appOrigin: origin,
    env: input?.env ?? { TALI_EMPLOYER_WALLET: employer },
  });
  return {
    execute: (body: unknown = attack) => execute(request(body, input?.requestOrigin)),
    resolveIdentity,
    submitAttack,
  };
}

describe('safety attack authorization', () => {
  it('submits an attack for the configured employer', async () => {
    const { execute, submitAttack } = handler();

    expect((await execute()).status).toBe(200);
    expect(submitAttack).toHaveBeenCalledWith(attack);
  });

  it('rejects another wallet without submitting', async () => {
    const { execute, submitAttack } = handler({ address: `0x${'c'.repeat(64)}` });

    expect((await execute()).status).toBe(403);
    expect(submitAttack).not.toHaveBeenCalled();
  });

  it('requires an authenticated wallet session', async () => {
    const { execute, submitAttack } = handler({ authenticationError: true });

    expect((await execute()).status).toBe(401);
    expect(submitAttack).not.toHaveBeenCalled();
  });

  it('rejects a foreign origin before session lookup', async () => {
    const { execute, resolveIdentity, submitAttack } = handler({
      requestOrigin: 'https://evil.example',
    });

    expect((await execute()).status).toBe(403);
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(submitAttack).not.toHaveBeenCalled();
  });

  it('fails closed without employer configuration', async () => {
    const { execute, submitAttack } = handler({ env: {} });

    expect((await execute()).status).toBe(503);
    expect(submitAttack).not.toHaveBeenCalled();
  });

  it('validates the request after authorization', async () => {
    const { execute, submitAttack } = handler();

    expect((await execute({ ...attack, amount: '0' })).status).toBe(400);
    expect(submitAttack).not.toHaveBeenCalled();
  });
});
