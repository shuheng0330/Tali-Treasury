import type { CreateClaimResponse } from '@tali/shared';

import { getBackendServices } from '../../../server/dependencies';
import { assertSameOrigin, resolveWalletIdentity } from '../../../server/auth/session';
import { ServerError, toApiError } from '../../../server/errors';

export const runtime = 'nodejs';

type CreateClaimService = (input: unknown) => Promise<CreateClaimResponse>;

type ResolveIdentity = (request: Request, legacyAddress?: string) => Promise<string>;

export function createClaimHandler(
  service: CreateClaimService,
  resolveIdentity?: ResolveIdentity,
  appOrigin?: string,
) {
  return async (request: Request): Promise<Response> => {
    try {
      let input: unknown;
      try {
        input = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', {
          cause: error,
        });
      }

      if (!input || typeof input !== 'object') {
        throw new ServerError('invalid_request', 400, 'Claim payload is required');
      }
      const payload = input as Record<string, unknown>;
      if (resolveIdentity) {
        if (appOrigin) assertSameOrigin(request, appOrigin);
        const submitter = await resolveIdentity(
          request,
          typeof payload.submitter === 'string' ? payload.submitter : undefined,
        );
        const { submitter: _legacy, ...confirmed } = payload;
        input = { ...confirmed, submitter };
      }

      return Response.json(await service(input), { status: 201 });
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    return createClaimHandler(
      (input) => services.createClaim(input),
      async (currentRequest, legacyAddress) =>
        (
          await resolveWalletIdentity({
            request: currentRequest,
            auth: services.auth,
            legacyAddress,
          })
        ).address,
      services.appOrigin,
    )(request);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
