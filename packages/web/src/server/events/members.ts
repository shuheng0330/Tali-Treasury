import type {
  Address,
  CreateEventMemberRequest,
  CreateEventMemberResponse,
  EventMember,
  ListEventMembersResponse,
} from '@tali/shared';
import { z } from 'zod';

import { assertAuthorizedWallet } from '../auth/authorization';
import { eventIdSchema, suiAddressSchema } from '../claims/validation';
import { isServerError, ServerError } from '../errors';

const createMemberSchema = z
  .object({
    address: suiAddressSchema,
    displayName: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => value === value.trim(), 'display name must already be trimmed'),
  })
  .strict();

export interface EventMemberRepository {
  findTreasurer(eventId: string): Promise<Address | null>;
  listActive(eventId: string): Promise<EventMember[]>;
  create(input: {
    eventId: string;
    address: Address;
    displayName: string;
  }): Promise<EventMember>;
}

function databaseFailure(error: unknown): ServerError {
  return isServerError(error)
    ? error
    : new ServerError('database_failed', 500, 'The database operation failed', {
        cause: error,
      });
}

async function authorizeTreasurer(
  members: EventMemberRepository,
  eventId: string,
  actor: string,
): Promise<void> {
  let treasurer: Address | null;
  try {
    treasurer = await members.findTreasurer(eventId);
  } catch (error) {
    throw databaseFailure(error);
  }
  if (!treasurer) {
    throw new ServerError('event_not_found', 404, 'Event not found');
  }
  assertAuthorizedWallet(actor, treasurer);
}

export function createListEventMembersService(deps: {
  members: EventMemberRepository;
}) {
  return async (input: {
    eventId: string;
    viewer: string;
  }): Promise<ListEventMembersResponse> => {
    let eventId: string;
    let viewer: string;
    try {
      eventId = eventIdSchema.parse(input.eventId);
      viewer = suiAddressSchema.parse(input.viewer);
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Invalid event or viewer', {
        cause: error,
      });
    }

    await authorizeTreasurer(deps.members, eventId, viewer);
    try {
      return { members: await deps.members.listActive(eventId) };
    } catch (error) {
      throw databaseFailure(error);
    }
  };
}

export function createAddEventMemberService(deps: {
  members: EventMemberRepository;
}) {
  return async (input: {
    eventId: string;
    actor: string;
    request: unknown;
  }): Promise<CreateEventMemberResponse> => {
    let eventId: string;
    let actor: string;
    try {
      eventId = eventIdSchema.parse(input.eventId);
      actor = suiAddressSchema.parse(input.actor);
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Invalid event or actor', {
        cause: error,
      });
    }

    await authorizeTreasurer(deps.members, eventId, actor);

    let request: CreateEventMemberRequest;
    try {
      request = createMemberSchema.parse(input.request);
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Invalid event member', {
        cause: error,
      });
    }

    try {
      return {
        member: await deps.members.create({
          eventId,
          address: request.address,
          displayName: request.displayName,
        }),
      };
    } catch (error) {
      throw databaseFailure(error);
    }
  };
}
