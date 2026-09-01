import type { ReviewClaimResponse } from '@tali/shared';

import { requireDemoIdentityEnabled } from '../../../../../server/demo-auth';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ReviewClaimService = (input: unknown) => Promise<ReviewClaimResponse>;

export function createReviewClaimHandler(service: ReviewClaimService) {
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
        typeof payload.reviewer !== 'string' ||
        (payload.reason !== undefined && typeof payload.reason !== 'string')
      ) {
        throw new ServerError('invalid_request', 400, 'Invalid review payload');
      }

      const { id } = await context.params;
      return Response.json(await service({ claimId: id, ...payload }));
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
    requireDemoIdentityEnabled();
    return createReviewClaimHandler((input) =>
      getBackendServices().reviewClaim(input),
    )(request, context);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
