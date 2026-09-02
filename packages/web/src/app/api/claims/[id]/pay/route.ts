import type { PayClaimResponse } from '@tali/shared';

import { assertSameOrigin, resolveWalletIdentity } from '../../../../../server/auth/session';
import { claimIdSchema } from '../../../../../server/claims/validation';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type PayClaimService = (input: {
  claimId: string;
  processor: string;
}) => Promise<PayClaimResponse>;

type ResolveIdentity = (request: Request, legacyAddress?: string) => Promise<string>;

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

/* A string that is not an address is a bad request, not a bad session. Letting
   it fall through to the identity resolver told the caller their wallet
   session was invalid when what they sent was a malformed address. */
function legacyAddress(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !SUI_ADDRESS.test(value)) {
    throw new ServerError('invalid_request', 400, `${field} must be a canonical Sui address`);
  }
  return value;
}


export function createPayClaimHandler(
  service: PayClaimService,
  resolveIdentity?: ResolveIdentity,
  appOrigin?: string,
) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', {
          cause: error,
        });
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ServerError('invalid_request', 400, 'The request body must be an object');
      }
      const { processor: supplied, ...rest } = body as Record<string, unknown>;
      const unknown = Object.keys(rest);
      if (unknown.length > 0) {
        throw new ServerError('invalid_request', 400, `Unrecognized key: "${unknown[0]}"`);
      }
      const processor = legacyAddress(supplied, 'processor');

      if (appOrigin) assertSameOrigin(request, appOrigin);
      const actor = resolveIdentity ? await resolveIdentity(request, processor) : processor;
      if (typeof actor !== 'string') {
        throw new ServerError(
          'authentication_required',
          401,
          'A valid wallet session is required',
        );
      }

      const { id } = await context.params;
      /* Checked here rather than left to Postgres. An id that is not a uuid
         reaches the column as 22P02, which the repository can only report as a
         database failure — a 500 for what is a caller's typo. */
      const claimId = claimIdSchema.safeParse(id);
      if (!claimId.success) {
        throw new ServerError('invalid_request', 400, 'A claim id must be a uuid');
      }

      /* A payment the contract refuses is a 200 carrying the reason: the claim
         moved to payment_failed and the caller needs to see why. */
      return Response.json(await service({ claimId: claimId.data, processor: actor }));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const services = getBackendServices();
    return createPayClaimHandler(
      (input) => services.payApprovedClaim(input),
      async (currentRequest, legacyAddress) =>
        (
          await resolveWalletIdentity({
            request: currentRequest,
            auth: services.auth,
            legacyAddress,
          })
        ).address,
      services.appOrigin,
    )(request, context);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
