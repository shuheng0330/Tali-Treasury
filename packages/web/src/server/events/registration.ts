import type {
  Address,
  ExpenseCategory,
  RegisterEventRequest,
  RegisterEventResponse,
} from '@tali/shared';
import { EXPENSE_CATEGORIES } from '@tali/shared';
import { z } from 'zod';

import { suiAddressSchema } from '../claims/validation';
import { isServerError, ServerError } from '../errors';

const DIGEST = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

const registerEventSchema = z
  .object({
    digest: z.string().regex(DIGEST, 'Invalid Sui transaction digest'),
    name: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => value === value.trim(), 'name must already be trimmed'),
    organisation: z
      .string()
      .min(1)
      .max(160)
      .refine((value) => value === value.trim(), 'organisation must already be trimmed'),
    allowedCategories: z
      .array(z.string().refine(
        (value): value is ExpenseCategory =>
          EXPENSE_CATEGORIES.includes(value as ExpenseCategory),
        'unsupported category',
      ))
      .min(1)
      .max(6)
      .refine((values) => new Set(values).size === values.length, 'duplicate categories'),
  })
  .strict();

export interface EventRegistrationSnapshot {
  digest: string;
  mandateId: string;
  packageId: string;
  coinType: string;
  treasurerWallet: Address;
  agentWallet: Address;
  approvedRecipients: Address[];
  initialBudget: string;
  maxPerClaim: string;
  expiryMs: number;
}

export interface EventRegistrationVerifier {
  verify(input: {
    digest: string;
    treasurer: Address;
  }): Promise<EventRegistrationSnapshot>;
}

export interface EventRegistrationRepository {
  register(input: {
    snapshot: EventRegistrationSnapshot;
    name: string;
    organisation: string;
    allowedCategories: ExpenseCategory[];
  }): Promise<{ eventId: string; mandateId: string; created: boolean }>;
}

export interface RegisterEventResult {
  created: boolean;
  response: RegisterEventResponse;
}

export function createRegisterEventService(deps: {
  chain: EventRegistrationVerifier;
  events: EventRegistrationRepository;
}) {
  return async (input: {
    actor: string;
    request: unknown;
  }): Promise<RegisterEventResult> => {
    let actor: Address;
    let request: RegisterEventRequest;
    try {
      actor = suiAddressSchema.parse(input.actor);
      request = registerEventSchema.parse(input.request) as RegisterEventRequest;
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Invalid event registration request', {
        cause: error,
      });
    }

    let snapshot: EventRegistrationSnapshot;
    try {
      snapshot = await deps.chain.verify({ digest: request.digest, treasurer: actor });
    } catch (error) {
      if (isServerError(error)) throw error;
      throw new ServerError(
        'event_registration_failed',
        502,
        'The treasury transaction could not be verified with Sui',
        { cause: error },
      );
    }

    let stored: Awaited<ReturnType<EventRegistrationRepository['register']>>;
    try {
      stored = await deps.events.register({
        snapshot,
        name: request.name,
        organisation: request.organisation,
        allowedCategories: request.allowedCategories,
      });
    } catch (error) {
      if (isServerError(error)) throw error;
      throw new ServerError('database_failed', 500, 'The database operation failed', {
        cause: error,
      });
    }

    return {
      created: stored.created,
      response: {
        status: 'registered',
        eventId: stored.eventId,
        mandateId: stored.mandateId as RegisterEventResponse['mandateId'],
      },
    };
  };
}
