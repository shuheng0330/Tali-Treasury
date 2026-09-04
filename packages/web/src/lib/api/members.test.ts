import type { CreateEventMemberResponse } from '@tali/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { tryAddEventMember } from './members';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('event member API client', () => {
  it('uses the shared roster request and response contracts', async () => {
    const address = `0x${'a'.repeat(64)}`;
    const response = {
      member: {
        eventId: 'event-id',
        address,
        displayName: 'New Member',
        addedAtMs: 1_788_480_000_000,
      },
    } as CreateEventMemberResponse;
    const fetchMock = vi.fn(async () => Response.json(response));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      tryAddEventMember('event/id', { walletAddress: address, displayName: 'New Member' }),
    ).resolves.toEqual({
      kind: 'added',
      walletAddress: address,
      displayName: 'New Member',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/events/event%2Fid/members', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, displayName: 'New Member' }),
    });
  });
});
