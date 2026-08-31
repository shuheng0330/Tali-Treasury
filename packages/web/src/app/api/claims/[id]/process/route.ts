import type { ProcessClaimResponse } from '@tali/shared';

import { requireDemoIdentityEnabled } from '../../../../../server/demo-auth';
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

export function createProcessClaimHandler(service: ProcessClaimService) {
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
      if (typeof processor !== 'string') {
        throw new ServerError(
          'invalid_request',
          400,
          'processor is required',
        );
      }

      const { id } = await context.params;
      return Response.json(await service({ claimId: id, processor }));
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
    return createProcessClaimHandler((input) =>
      getBackendServices().processClaim(input),
    )(request, context);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
