import type { ReviewClaimResponse } from '@tali/shared';

import { assertSameOrigin, resolveWalletIdentity } from '../../../../../server/auth/session';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ReviewClaimService = (input: unknown) => Promise<ReviewClaimResponse>;

type ResolveIdentity = (request: Request, legacyAddress?: string) => Promise<string>;

export function createReviewClaimHandler(
  service: ReviewClaimService,
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
      if (!body || typeof body !== 'object') {
        throw new ServerError('invalid_request', 400, 'Review payload is required');
      }
      const payload = body as Record<string, unknown>;
      if (
        typeof payload.action !== 'string' ||
        (payload.reviewer !== undefined && typeof payload.reviewer !== 'string') ||
        (payload.reason !== undefined && typeof payload.reason !== 'string') ||
        ((payload.action === 'reject' || payload.action === 'request_correction') &&
          typeof payload.reason !== 'string')
      ) {
        throw new ServerError('invalid_request', 400, 'Invalid review payload');
      }

      if (appOrigin) assertSameOrigin(request, appOrigin);
      const reviewer = resolveIdentity
        ? await resolveIdentity(
            request,
            typeof payload.reviewer === 'string' ? payload.reviewer : undefined,
          )
        : payload.reviewer;
      if (typeof reviewer !== 'string') {
        throw new ServerError('authentication_required', 401, 'A valid wallet session is required');
      }

      const { id } = await context.params;
      const { reviewer: _legacy, ...action } = payload;
      return Response.json(await service({ claimId: id, ...action, reviewer }));
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
    return createReviewClaimHandler(
      (input) => services.reviewClaim(input),
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
