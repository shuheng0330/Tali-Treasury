import type { GetWalletSessionResponse } from '@tali/shared';

import type { WalletAuthRepository } from '../../../../server/auth/service';
import {
  assertSameOrigin,
  clearSessionCookie,
  createSessionCookie,
  resolveWalletIdentity,
  revokeWalletSession,
} from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../server/errors';

export const runtime = 'nodejs';

type CompleteSession = (input: unknown) => Promise<{
  session: GetWalletSessionResponse;
  token: string;
}>;

function errorResponse(error: unknown): Response {
  const { body, status } = toApiError(error);
  return Response.json(body, { status });
}

export function createWalletSessionHandlers(deps: {
  complete: CompleteSession;
  auth: WalletAuthRepository;
  appOrigin: string;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  return {
    POST: async (request: Request): Promise<Response> => {
      try {
        assertSameOrigin(request, deps.appOrigin);
        let input: unknown;
        try {
          input = await request.json();
        } catch (error) {
          throw new ServerError('invalid_request', 400, 'Expected valid JSON', {
            cause: error,
          });
        }
        const { session, token } = await deps.complete(input);
        return Response.json(session, {
          headers: {
            'set-cookie': createSessionCookie({
              token,
              expiresAtMs: Date.parse(session.expiresAt),
              appOrigin: deps.appOrigin,
            }),
          },
        });
      } catch (error) {
        return errorResponse(error);
      }
    },

    GET: async (request: Request): Promise<Response> => {
      try {
        const identity = await resolveWalletIdentity({
          request,
          auth: deps.auth,
          nowMs: now(),
          env: { TALI_ALLOW_INSECURE_DEMO_IDENTITY: 'false' },
        });
        return Response.json({
          address: identity.address,
          expiresAt: identity.expiresAt,
        });
      } catch (error) {
        return errorResponse(error);
      }
    },

    DELETE: async (request: Request): Promise<Response> => {
      try {
        assertSameOrigin(request, deps.appOrigin);
        await revokeWalletSession({ request, auth: deps.auth, nowMs: now() });
        return new Response(null, {
          status: 204,
          headers: { 'set-cookie': clearSessionCookie(deps.appOrigin) },
        });
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

function handlers() {
  const services = getBackendServices();
  return createWalletSessionHandlers({
    complete: services.completeWalletSession,
    auth: services.auth,
    appOrigin: services.appOrigin,
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    return handlers().POST(request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    return handlers().GET(request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    return handlers().DELETE(request);
  } catch (error) {
    return errorResponse(error);
  }
}
