import type {
  CreateEventMemberResponse,
  ListEventMembersResponse,
} from '@tali/shared';

import { assertSameOrigin, resolveWalletIdentity } from '../../../../../server/auth/session';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ResolveIdentity = (request: Request) => Promise<string>;

export function createListMembersHandler(deps: {
  list: (input: { eventId: string; viewer: string }) => Promise<ListEventMembersResponse>;
  resolveIdentity: ResolveIdentity;
}) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    try {
      const viewer = await deps.resolveIdentity(request);
      const { id } = await context.params;
      return Response.json(await deps.list({ eventId: id, viewer }));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export function createAddMemberHandler(deps: {
  add: (input: {
    eventId: string;
    actor: string;
    request: unknown;
  }) => Promise<CreateEventMemberResponse>;
  resolveIdentity: ResolveIdentity;
  appOrigin: string;
}) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    try {
      assertSameOrigin(request, deps.appOrigin);
      const actor = await deps.resolveIdentity(request);
      const { id } = await context.params;

      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', {
          cause: error,
        });
      }

      return Response.json(
        await deps.add({ eventId: id, actor, request: body }),
        { status: 201 },
      );
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

function sessionResolver(services: ReturnType<typeof getBackendServices>): ResolveIdentity {
  return async (request) =>
    (
      await resolveWalletIdentity({
        request,
        auth: services.auth,
      })
    ).address;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const services = getBackendServices();
    return createListMembersHandler({
      list: services.listEventMembers,
      resolveIdentity: sessionResolver(services),
    })(request, context);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const services = getBackendServices();
    return createAddMemberHandler({
      add: services.addEventMember,
      resolveIdentity: sessionResolver(services),
      appOrigin: services.appOrigin,
    })(request, context);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
