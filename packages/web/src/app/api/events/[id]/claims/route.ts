import type { ListClaimsResponse } from '@tali/shared';

import { requireDemoIdentityEnabled } from '../../../../../server/demo-auth';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ListClaimsService = (input: {
  eventId: string;
  viewer: string;
}) => Promise<ListClaimsResponse>;

export function createListClaimsHandler(service: ListClaimsService) {
  return async (_request: Request, context: RouteContext): Promise<Response> => {
    try {
      const { id } = await context.params;
      const viewer = new URL(_request.url).searchParams.get('viewer');
      if (!viewer) {
        throw new ServerError('invalid_request', 400, 'viewer is required');
      }
      return Response.json(await service({ eventId: id, viewer }));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireDemoIdentityEnabled();
    return createListClaimsHandler((input) =>
      getBackendServices().listClaims(input),
    )(request, context);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
