import type { ListClaimsResponse } from '@tali/shared';

import { getBackendServices } from '../../../../../server/dependencies';
import { toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ListClaimsService = (eventId: string) => Promise<ListClaimsResponse>;

export function createListClaimsHandler(service: ListClaimsService) {
  return async (_request: Request, context: RouteContext): Promise<Response> => {
    try {
      const { id } = await context.params;
      return Response.json(await service(id));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return createListClaimsHandler((eventId) =>
    getBackendServices().listClaims(eventId),
  )(request, context);
}
