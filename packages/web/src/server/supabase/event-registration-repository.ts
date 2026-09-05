import type { Address, ExpenseCategory } from '@tali/shared';

import type {
  EventRegistrationRepository,
  EventRegistrationSnapshot,
} from '../events/registration';
import { ServerError } from '../errors';

interface DatabaseError {
  code?: string;
  message?: string;
}

interface QueryResult {
  data: unknown;
  error: DatabaseError | null;
}

interface QueryBuilder {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  update(value: unknown): QueryBuilder;
  insert(value: unknown): QueryBuilder;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
}

interface SupabaseDataClient {
  from(table: string): unknown;
}

interface EventRow {
  id: string;
  name: string;
  organisation: string;
  mandate_object_id: string;
  treasurer_wallet: string;
  allowed_categories: ExpenseCategory[];
}

const EVENT_COLUMNS =
  'id, name, organisation, mandate_object_id, treasurer_wallet, allowed_categories';

function query(client: SupabaseDataClient, table: string): QueryBuilder {
  return client.from(table) as QueryBuilder;
}

function databaseFailure(error: DatabaseError | null): ServerError {
  return new ServerError('database_failed', 500, 'The database operation failed', {
    cause: error ?? undefined,
  });
}

function registrationConflict(): ServerError {
  return new ServerError(
    'event_registration_conflict',
    409,
    'This mandate is already registered with different event details',
  );
}

function sameCategories(left: ExpenseCategory[], right: ExpenseCategory[]): boolean {
  return left.length === right.length && left.every((category, index) => category === right[index]);
}

function shortWallet(address: Address): string {
  return `Wallet ${address.slice(0, 6)}…${address.slice(-4)}`;
}

function sameEvent(
  event: EventRow,
  input: {
    snapshot: EventRegistrationSnapshot;
    name: string;
    organisation: string;
    allowedCategories: ExpenseCategory[];
  },
): boolean {
  return (
    event.name === input.name &&
    event.organisation === input.organisation &&
    event.mandate_object_id === input.snapshot.mandateId &&
    event.treasurer_wallet === input.snapshot.treasurerWallet &&
    sameCategories(event.allowed_categories, input.allowedCategories)
  );
}

export function createSupabaseEventRegistrationRepository(
  client: SupabaseDataClient,
): EventRegistrationRepository {
  async function ensureMember(eventId: string, address: Address): Promise<void> {
    const existing = await query(client, 'event_members')
      .select('event_id, active')
      .eq('event_id', eventId)
      .eq('wallet_address', address)
      .maybeSingle();
    if (existing.error) throw databaseFailure(existing.error);

    if (existing.data) {
      const active = (existing.data as { active?: unknown }).active;
      if (active === true) return;
      const restored = await query(client, 'event_members')
        .update({ active: true })
        .eq('event_id', eventId)
        .eq('wallet_address', address)
        .select('event_id')
        .maybeSingle();
      if (restored.error) throw databaseFailure(restored.error);
      return;
    }

    const inserted = await query(client, 'event_members')
      .insert({
        event_id: eventId,
        wallet_address: address,
        display_name: shortWallet(address),
        active: true,
      })
      .select('event_id')
      .single();
    if (inserted.error && inserted.error.code !== '23505') {
      throw databaseFailure(inserted.error);
    }
  }

  /**
   * The treasurer belongs on the roster of their own event.
   *
   * Only the approved recipients were added, which are the wallets a claim can
   * be paid to. Reading the queue is gated on membership by
   * `assertEventViewer`, so the person who funded the treasury and is the only
   * one allowed to decide its claims could not list them: the read threw, the
   * client fell back to fixture data, and the employer saw a queue that never
   * contained anything a member had actually submitted.
   *
   * The seeded event was patched by hand in a migration once this was hit.
   * Every treasury created through the app since then had the same hole,
   * because the patch was data and the cause was here.
   */
  async function ensureMembers(
    eventId: string,
    treasurer: Address,
    recipients: Address[],
  ): Promise<void> {
    for (const address of [treasurer, ...recipients]) await ensureMember(eventId, address);
  }

  return {
    async register(input) {
      const existing = await query(client, 'events')
        .select(EVENT_COLUMNS)
        .eq('mandate_object_id', input.snapshot.mandateId)
        .maybeSingle();
      if (existing.error) throw databaseFailure(existing.error);

      if (existing.data) {
        const event = existing.data as EventRow;
        if (!sameEvent(event, input)) throw registrationConflict();
        await ensureMembers(
          event.id,
          input.snapshot.treasurerWallet,
          input.snapshot.approvedRecipients,
        );
        return { eventId: event.id, mandateId: input.snapshot.mandateId, created: false };
      }

      const created = await query(client, 'events')
        .insert({
          name: input.name,
          organisation: input.organisation,
          mandate_object_id: input.snapshot.mandateId,
          treasurer_wallet: input.snapshot.treasurerWallet,
          allowed_categories: input.allowedCategories,
          starts_at: new Date().toISOString(),
          expires_at: new Date(input.snapshot.expiryMs).toISOString(),
        })
        .select('id')
        .single();
      if (created.error || !created.data) throw databaseFailure(created.error);

      const eventId = (created.data as { id?: unknown }).id;
      if (typeof eventId !== 'string') throw databaseFailure(null);
      await ensureMembers(
        eventId,
        input.snapshot.treasurerWallet,
        input.snapshot.approvedRecipients,
      );
      return { eventId, mandateId: input.snapshot.mandateId, created: true };
    },
  };
}
