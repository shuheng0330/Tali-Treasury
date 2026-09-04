import { describe, expect, it, vi } from 'vitest';

import { createSupabaseEventMemberRepository } from './event-member-repository';

const eventId = '11111111-1111-4111-8111-111111111111';
const treasurer = `0x${'a'.repeat(64)}`;
const memberAddress = `0x${'b'.repeat(64)}`;
const row = {
  event_id: eventId,
  wallet_address: memberAddress,
  display_name: 'New Member',
  created_at: '2026-09-04T10:00:00.000Z',
};

function client(results: Record<string, { data: unknown; error: unknown }>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  function builder(table: string) {
    const result = results[table] ?? { data: null, error: null };
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'insert']) {
      query[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return query;
      });
    }
    query.single = vi.fn(async () => result);
    query.maybeSingle = vi.fn(async () => result);
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return query;
  }

  return {
    from: vi.fn((table: string) => builder(table)),
    calls,
  };
}

describe('createSupabaseEventMemberRepository', () => {
  it('loads the canonical event treasurer', async () => {
    const supabase = client({
      events: { data: { treasurer_wallet: treasurer }, error: null },
    });
    const repository = createSupabaseEventMemberRepository(supabase as never);

    await expect(repository.findTreasurer(eventId)).resolves.toBe(treasurer);
    expect(supabase.calls).toContainEqual({
      table: 'events',
      method: 'eq',
      args: ['id', eventId],
    });
  });

  it('returns null when the event does not exist', async () => {
    const repository = createSupabaseEventMemberRepository(
      client({ events: { data: null, error: null } }) as never,
    );

    await expect(repository.findTreasurer(eventId)).resolves.toBeNull();
  });

  it('lists only active members in deterministic order', async () => {
    const supabase = client({ event_members: { data: [row], error: null } });
    const repository = createSupabaseEventMemberRepository(supabase as never);

    await expect(repository.listActive(eventId)).resolves.toEqual([
      {
        eventId,
        address: memberAddress,
        displayName: 'New Member',
        addedAtMs: Date.parse(row.created_at),
      },
    ]);
    expect(supabase.calls).toContainEqual({
      table: 'event_members',
      method: 'eq',
      args: ['active', true],
    });
    expect(supabase.calls.filter((call) => call.method === 'order')).toEqual([
      { table: 'event_members', method: 'order', args: ['created_at', { ascending: true }] },
      { table: 'event_members', method: 'order', args: ['wallet_address', { ascending: true }] },
    ]);
  });

  it('inserts a new active member and maps the stored row', async () => {
    const supabase = client({ event_members: { data: row, error: null } });
    const repository = createSupabaseEventMemberRepository(supabase as never);

    await expect(
      repository.create({ eventId, address: memberAddress, displayName: 'New Member' }),
    ).resolves.toMatchObject({ address: memberAddress, displayName: 'New Member' });
    expect(supabase.calls).toContainEqual({
      table: 'event_members',
      method: 'insert',
      args: [
        {
          event_id: eventId,
          wallet_address: memberAddress,
          display_name: 'New Member',
          active: true,
        },
      ],
    });
  });

  it('maps a duplicate event wallet to a safe conflict', async () => {
    const repository = createSupabaseEventMemberRepository(
      client({
        event_members: {
          data: null,
          error: { code: '23505', message: 'private constraint details' },
        },
      }) as never,
    );

    await expect(
      repository.create({ eventId, address: memberAddress, displayName: 'New Member' }),
    ).rejects.toMatchObject({
      code: 'member_already_exists',
      status: 409,
      message: 'This wallet is already on the event roster',
    });
  });

  it('sanitizes other database errors', async () => {
    const repository = createSupabaseEventMemberRepository(
      client({
        event_members: {
          data: null,
          error: { code: 'XX000', message: 'private provider details' },
        },
      }) as never,
    );

    const error = await repository.listActive(eventId).catch((thrown: unknown) => thrown);
    expect(error).toMatchObject({ code: 'database_failed', status: 500 });
    expect((error as Error).message).not.toContain('private provider details');
  });

  it('fails safely for malformed rows', async () => {
    const repository = createSupabaseEventMemberRepository(
      client({ event_members: { data: [{ ...row, created_at: 'not-a-date' }], error: null } }) as never,
    );

    await expect(repository.listActive(eventId)).rejects.toMatchObject({
      code: 'database_failed',
      status: 500,
    });
  });
});
