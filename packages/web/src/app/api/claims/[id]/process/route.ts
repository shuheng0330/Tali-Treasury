import type { ProcessClaimResponse } from '@tali/shared';

import { assertSameOrigin, resolveWalletIdentity } from '../../../../../server/auth/session';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ProcessClaimService = (input: {
  claimId: string;
  processor: string;
}) => Promise<ProcessClaimResponse>;

type ResolveIdentity = (request: Request, legacyAddress?: string) => Promise<string>;

export function createProcessClaimHandler(
  service: ProcessClaimService,
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
        body && typeof body === 'object' && 'processor' in body
          ? body.processor
          : undefined;
      if (processor !== undefined && typeof processor !== 'string') {
        throw new ServerError(
          'invalid_request',
          400,
          'processor is required',
        );
      }

      if (appOrigin) assertSameOrigin(request, appOrigin);
      const actor = resolveIdentity
        ? await resolveIdentity(request, processor)
        : processor;
      if (typeof actor !== 'string') {
        throw new ServerError('authentication_required', 401, 'A valid wallet session is required');
      }

      const { id } = await context.params;
      return Response.json(await service({ claimId: id, processor: actor }));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const services = getBackendServices();
    return createProcessClaimHandler(
      (input) => services.processClaim(input),
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
