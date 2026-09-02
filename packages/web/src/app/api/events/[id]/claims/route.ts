import type { ListClaimsResponse } from '@tali/shared';

import { resolveWalletIdentity } from '../../../../../server/auth/session';
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

type ResolveIdentity = (request: Request, legacyAddress?: string) => Promise<string>;

export function createListClaimsHandler(
  service: ListClaimsService,
  resolveIdentity?: ResolveIdentity,
) {
  return async (_request: Request, context: RouteContext): Promise<Response> => {
    try {
      const { id } = await context.params;
      const legacyViewer = new URL(_request.url).searchParams.get('viewer') ?? undefined;
      const viewer = resolveIdentity
        ? await resolveIdentity(_request, legacyViewer)
        : legacyViewer;
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
    const services = getBackendServices();
    return createListClaimsHandler(
      (input) => services.listClaims(input),
      async (currentRequest, legacyAddress) =>
        (
          await resolveWalletIdentity({
            request: currentRequest,
            auth: services.auth,
            legacyAddress,
          })
        ).address,
    )(request, context);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
