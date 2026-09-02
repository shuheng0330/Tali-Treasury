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
      const processor =
        body && typeof body === 'object' && 'processor' in body ? body.processor : undefined;
      if (processor !== undefined && typeof processor !== 'string') {
        throw new ServerError('invalid_request', 400, 'processor must be a Sui address');
      }

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
