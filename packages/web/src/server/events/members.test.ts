import type { EventMember } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../errors';
import {
  createAddEventMemberService,
  createListEventMembersService,
  type EventMemberRepository,
} from './members';

const eventId = '11111111-1111-4111-8111-111111111111';
const treasurer = `0x${'a'.repeat(64)}`;
const memberAddress = `0x${'b'.repeat(64)}`;
const member: EventMember = {
  eventId,
  address: memberAddress,
  displayName: 'New Member',
  addedAtMs: Date.parse('2026-09-04T10:00:00.000Z'),
};

function repository(overrides: Partial<EventMemberRepository> = {}): EventMemberRepository {
  return {
    findTreasurer: vi.fn(async () => treasurer),
    listActive: vi.fn(async () => [member]),
    create: vi.fn(async () => member),
    ...overrides,
  };
}

describe('list event members', () => {
  it('returns the active roster to the event treasurer', async () => {
    const members = repository();
    const list = createListEventMembersService({ members });

    await expect(list({ eventId, viewer: treasurer })).resolves.toEqual({ members: [member] });
    expect(members.listActive).toHaveBeenCalledWith(eventId);
  });

  it('denies another wallet before reading the roster', async () => {
    const members = repository();
    const list = createListEventMembersService({ members });

    await expect(
      list({ eventId, viewer: `0x${'c'.repeat(64)}` }),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    expect(members.listActive).not.toHaveBeenCalled();
  });

  it('returns a safe not-found error for an unknown event', async () => {
    const list = createListEventMembersService({
      members: repository({ findTreasurer: vi.fn(async () => null) }),
    });

    await expect(list({ eventId, viewer: treasurer })).rejects.toMatchObject({
      code: 'event_not_found',
      status: 404,
    });
  });
});

describe('add event member', () => {
  it('adds a validated active member for the event treasurer', async () => {
    const members = repository();
    const add = createAddEventMemberService({ members });

    await expect(
      add({
        eventId,
        actor: treasurer,
        request: { address: memberAddress, displayName: 'New Member' },
      }),
    ).resolves.toEqual({ member });
    expect(members.create).toHaveBeenCalledWith({
      eventId,
      address: memberAddress,
      displayName: 'New Member',
    });
  });

  it('denies another wallet before inserting', async () => {
    const members = repository();
    const add = createAddEventMemberService({ members });

    await expect(
      add({
        eventId,
        actor: `0x${'c'.repeat(64)}`,
        request: { address: memberAddress, displayName: 'New Member' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    expect(members.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ address: '0x1234', displayName: 'New Member' }, 'address'],
    [{ address: memberAddress, displayName: ' padded ' }, 'display name'],
    [{ address: memberAddress, displayName: '' }, 'display name'],
  ])('rejects an invalid %s request', async (request) => {
    const members = repository();
    const add = createAddEventMemberService({ members });

    await expect(
      add({ eventId, actor: treasurer, request }),
    ).rejects.toMatchObject({ code: 'invalid_request', status: 400 });
    expect(members.create).not.toHaveBeenCalled();
  });

  it('preserves a safe duplicate-member conflict', async () => {
    const add = createAddEventMemberService({
      members: repository({
        create: vi.fn(async () => {
          throw new ServerError(
            'member_already_exists',
            409,
            'This wallet is already on the event roster',
          );
        }),
      }),
    });

    await expect(
      add({
        eventId,
        actor: treasurer,
        request: { address: memberAddress, displayName: 'New Member' },
      }),
    ).rejects.toMatchObject({ code: 'member_already_exists', status: 409 });
  });

  it('sanitizes unexpected repository failures', async () => {
    const add = createAddEventMemberService({
      members: repository({
        create: vi.fn(async () => {
          throw new Error('database connection details');
        }),
      }),
    });

    await expect(
      add({
        eventId,
        actor: treasurer,
        request: { address: memberAddress, displayName: 'New Member' },
      }),
    ).rejects.toMatchObject({ code: 'database_failed', status: 500 });
  });
});
