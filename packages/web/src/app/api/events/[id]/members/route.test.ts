import type {
  CreateEventMemberResponse,
  ListEventMembersResponse,
} from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../../server/errors';
import { createAddMemberHandler, createListMembersHandler } from './route';

const origin = 'https://tali-treasury.vercel.app';
const eventId = '11111111-1111-4111-8111-111111111111';
const treasurer = `0x${'a'.repeat(64)}`;
const member = {
  eventId,
  address: `0x${'b'.repeat(64)}`,
  displayName: 'New Member',
  addedAtMs: Date.parse('2026-09-04T10:00:00.000Z'),
};

function context(id = eventId) {
  return { params: Promise.resolve({ id }) };
}

function getRequest() {
  return new Request(`${origin}/api/events/${eventId}/members`);
}

function postRequest(body: unknown, requestOrigin = origin) {
  return new Request(`${origin}/api/events/${eventId}/members`, {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET event members', () => {
  it('lists members using the authenticated wallet', async () => {
    const list = vi.fn(async (): Promise<ListEventMembersResponse> => ({ members: [member] }));
    const response = await createListMembersHandler({
      list,
      resolveIdentity: vi.fn(async () => treasurer),
    })(getRequest(), context());

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith({ eventId, viewer: treasurer });
    await expect(response.json()).resolves.toEqual({ members: [member] });
  });

  it('requires a wallet session before listing', async () => {
    const list = vi.fn();
    const response = await createListMembersHandler({
      list,
      resolveIdentity: vi.fn(async () => {
        throw new ServerError(
          'authentication_required',
          401,
          'A valid wallet session is required',
        );
      }),
    })(getRequest(), context());

    expect(response.status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it('serializes a non-treasurer denial safely', async () => {
    const response = await createListMembersHandler({
      list: vi.fn(async () => {
        throw new ServerError('forbidden', 403, 'Only the event treasurer may manage members');
      }),
      resolveIdentity: vi.fn(async () => `0x${'c'.repeat(64)}`),
    })(getRequest(), context());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'forbidden',
      message: 'Only the event treasurer may manage members',
    });
  });
});

describe('POST event members', () => {
  const payload = { address: member.address, displayName: member.displayName };

  it('creates a member using the authenticated wallet', async () => {
    const add = vi.fn(async (): Promise<CreateEventMemberResponse> => ({ member }));
    const response = await createAddMemberHandler({
      add,
      resolveIdentity: vi.fn(async () => treasurer),
      appOrigin: origin,
    })(postRequest(payload), context());

    expect(response.status).toBe(201);
    expect(add).toHaveBeenCalledWith({ eventId, actor: treasurer, request: payload });
    await expect(response.json()).resolves.toEqual({ member });
  });

  it('rejects a foreign origin before session lookup or insertion', async () => {
    const add = vi.fn();
    const resolveIdentity = vi.fn(async () => treasurer);
    const response = await createAddMemberHandler({
      add,
      resolveIdentity,
      appOrigin: origin,
    })(postRequest(payload, 'https://evil.example'), context());

    expect(response.status).toBe(403);
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('requires a wallet session before parsing or insertion', async () => {
    const add = vi.fn();
    const response = await createAddMemberHandler({
      add,
      resolveIdentity: vi.fn(async () => {
        throw new ServerError(
          'authentication_required',
          401,
          'A valid wallet session is required',
        );
      }),
      appOrigin: origin,
    })(postRequest(payload), context());

    expect(response.status).toBe(401);
    expect(add).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON without insertion', async () => {
    const add = vi.fn();
    const request = new Request(`${origin}/api/events/${eventId}/members`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: '{',
    });
    const response = await createAddMemberHandler({
      add,
      resolveIdentity: vi.fn(async () => treasurer),
      appOrigin: origin,
    })(request, context());

    expect(response.status).toBe(400);
    expect(add).not.toHaveBeenCalled();
  });

  it('preserves a safe duplicate conflict', async () => {
    const response = await createAddMemberHandler({
      add: vi.fn(async () => {
        throw new ServerError(
          'member_already_exists',
          409,
          'This wallet is already on the event roster',
        );
      }),
      resolveIdentity: vi.fn(async () => treasurer),
      appOrigin: origin,
    })(postRequest(payload), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'member_already_exists' });
  });
});
