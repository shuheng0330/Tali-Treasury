import { describe, expect, it, vi } from 'vitest';

import { createSupabaseEventRegistrationRepository } from './event-registration-repository';

const eventId = '11111111-1111-4111-8111-111111111111';
const treasurer = `0x${'a'.repeat(64)}`;
const recipient = `0x${'b'.repeat(64)}`;
const mandateId = `0x${'c'.repeat(64)}`;

/**
 * Records every insert so a test can ask who ended up on the roster.
 *
 * `events` answers `null` on the first read so `register` takes the create
 * path, and a row on the insert. `event_members` answers `null` to the
 * existence check, which sends every address down the insert branch.
 */
function client() {
  const inserted: Array<{ table: string; values: Record<string, unknown> }> = [];
  let eventReads = 0;

  function builder(table: string) {
    const query: Record<string, unknown> = {};
    let result: { data: unknown; error: unknown } = { data: null, error: null };

    query.insert = vi.fn((values: Record<string, unknown>) => {
      inserted.push({ table, values });
      result = { data: table === 'events' ? { id: eventId } : { event_id: eventId }, error: null };
      return query;
    });
    for (const method of ['select', 'eq', 'update', 'order']) {
      query[method] = vi.fn(() => query);
    }
    query.single = vi.fn(async () => result);
    query.maybeSingle = vi.fn(async () => {
      if (table === 'events') {
        eventReads += 1;
        return { data: null, error: null };
      }
      return result.data ? result : { data: null, error: null };
    });
    return query;
  }

  return { supabase: { from: vi.fn((table: string) => builder(table)) }, inserted, reads: () => eventReads };
}

const snapshot = {
  digest: 'D'.repeat(44),
  mandateId,
  agentCapId: `0x${'d'.repeat(64)}`,
  packageId: `0x${'e'.repeat(64)}`,
  coinType: '0x2::usdc::USDC',
  treasurerWallet: treasurer,
  agentWallet: `0x${'f'.repeat(64)}`,
  approvedRecipients: [recipient],
  initialBudget: '20000000',
  maxPerClaim: '5000000',
  expiryMs: 4_000_000_000_000,
};

describe('createSupabaseEventRegistrationRepository', () => {
  /**
   * Reading the queue is gated on membership, so a treasurer who is not on the
   * roster of their own event cannot list its claims: the read throws, the
   * client falls back to fixture data, and the employer sees a queue that never
   * contains anything a member submitted. Only the approved recipients used to
   * be added.
   */
  it('puts the treasurer on the roster of the event they funded', async () => {
    const { supabase, inserted } = client();
    const repository = createSupabaseEventRegistrationRepository(supabase as never);

    await repository.register({
      name: 'Orientation Week',
      organisation: 'FSKTM',
      allowedCategories: ['food'],
      snapshot: snapshot as never,
    } as never);

    const members = inserted
      .filter((row) => row.table === 'event_members')
      .map((row) => row.values.wallet_address);

    expect(members).toContain(treasurer);
    expect(members).toContain(recipient);
  });

  it('still records the event itself against its mandate', async () => {
    const { supabase, inserted } = client();
    const repository = createSupabaseEventRegistrationRepository(supabase as never);

    const result = await repository.register({
      name: 'Orientation Week',
      organisation: 'FSKTM',
      allowedCategories: ['food'],
      snapshot: snapshot as never,
    } as never);

    expect(result).toMatchObject({ eventId, mandateId, created: true });
    expect(inserted.find((row) => row.table === 'events')?.values).toMatchObject({
      mandate_object_id: mandateId,
      treasurer_wallet: treasurer,
    });
  });
});
