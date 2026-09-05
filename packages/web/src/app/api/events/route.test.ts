import type { Address } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../server/errors';
import { createEventRegisterHandler } from './route';

const origin = 'https://tali.example';
const employer = `0x${'a'.repeat(64)}` as Address;
const digest = '4'.repeat(44);
const responseBody = {
  status: 'registered' as const,
  eventId: 'd2719c3a-3b7a-4a70-bf5b-5adf3ee3bf77',
  mandateId: `0x${'b'.repeat(64)}`,
};

function request(body: string, requestOrigin = origin) {
  return new Request(`${origin}/api/events`, {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    body,
  });
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    register: vi.fn(async () => ({ created: true, response: responseBody })),
    resolveIdentity: vi.fn(async () => employer),
    appOrigin: origin,
    env: { TALI_EMPLOYER_WALLET: employer },
    ...overrides,
  };
}

describe('POST /api/events', () => {
  it('returns 201 for a newly registered funded event', async () => {
    const current = deps();
    const response = await createEventRegisterHandler(current)(
      request(JSON.stringify({
        digest,
        name: 'MUBA Hack',
        organisation: 'MMU',
        allowedCategories: ['food'],
      })),
    );
    expect(response.status).toBe(201);
    expect(current.register).toHaveBeenCalledWith({
      actor: employer,
      request: {
        digest,
        name: 'MUBA Hack',
        organisation: 'MMU',
        allowedCategories: ['food'],
      },
    });
    await expect(response.json()).resolves.toEqual(responseBody);
  });

  it('returns 200 for an idempotent retry', async () => {
    const response = await createEventRegisterHandler(deps({
      register: vi.fn(async () => ({ created: false, response: responseBody })),
    }))(request(JSON.stringify({
      digest,
      name: 'MUBA Hack',
      organisation: 'MMU',
      allowedCategories: ['food'],
    })));
    expect(response.status).toBe(200);
  });

  it('rejects a foreign origin before identity lookup', async () => {
    const current = deps();
    const response = await createEventRegisterHandler(current)(request('{', 'https://evil.example'));
    expect(response.status).toBe(403);
    expect(current.resolveIdentity).not.toHaveBeenCalled();
    expect(current.register).not.toHaveBeenCalled();
  });

  it('requires the configured employer wallet', async () => {
    const current = deps({ resolveIdentity: vi.fn(async () => `0x${'c'.repeat(64)}`) });
    const response = await createEventRegisterHandler(current)(request('{'));
    expect(response.status).toBe(403);
    expect(current.register).not.toHaveBeenCalled();
  });

  it('requires a valid wallet session', async () => {
    const current = deps({
      resolveIdentity: vi.fn(async () => {
        throw new ServerError('authentication_required', 401, 'A valid wallet session is required');
      }),
    });
    const response = await createEventRegisterHandler(current)(request('{'));
    expect(response.status).toBe(401);
    expect(current.register).not.toHaveBeenCalled();
  });

  it('returns safe JSON for malformed input and verifier failures', async () => {
    const invalid = deps();
    const invalidResponse = await createEventRegisterHandler(invalid)(request('{'));
    expect(invalidResponse.status).toBe(400);
    expect(invalid.register).not.toHaveBeenCalled();

    const failed = deps({
      register: vi.fn(async () => {
        throw new ServerError(
          'event_registration_refused',
          422,
          'The transaction does not create a supported expense treasury',
        );
      }),
    });
    const failedResponse = await createEventRegisterHandler(failed)(
      request(JSON.stringify({
        digest,
        name: 'MUBA Hack',
        organisation: 'MMU',
        allowedCategories: ['food'],
      })),
    );
    expect(failedResponse.status).toBe(422);
    await expect(failedResponse.json()).resolves.toEqual({
      error: 'event_registration_refused',
      message: 'The transaction does not create a supported expense treasury',
    });
  });
});
