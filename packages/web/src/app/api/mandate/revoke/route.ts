import { z } from 'zod';

import {
  authorizeEmployerRequest,
  type ResolveRequestIdentity,
} from '../../../../server/auth/authorization';
import { resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import type { EnvLike } from '../../../../server/env';
import { requireAppOrigin } from '../../../../server/env';
import { ServerError, toApiError } from '../../../../server/errors';
import { getRevokePort, mandateIdForRevocation } from '../../../../server/mandate/dependencies';

export const runtime = 'nodejs';

const revokeSchema = z
  .object({
    /* The event name, typed out by the treasurer. Revocation cannot be undone
       and stops every payment from this mandate, so it does not happen on one
       click landing in the wrong place. */
    confirm: z.string().trim().min(1),
    expected: z.string().trim().min(1),
  })
  .strict();

export function createRevokeHandler(deps: {
  revoke: () => Promise<unknown>;
  resolveIdentity: ResolveRequestIdentity;
  appOrigin: string;
  env?: EnvLike;
}) {
  return async function revokeHandler(request: Request): Promise<Response> {
    try {
      await authorizeEmployerRequest({
        request,
        appOrigin: deps.appOrigin,
        resolveIdentity: deps.resolveIdentity,
        env: deps.env,
      });

      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
      }

      const parsed = revokeSchema.safeParse(body);
      if (!parsed.success) {
        throw new ServerError('invalid_request', 400, 'A typed confirmation is required');
      }
      if (parsed.data.confirm !== parsed.data.expected) {
        throw new ServerError(
          'invalid_request',
          400,
          'The typed confirmation does not match the event name',
        );
      }

      return Response.json(await deps.revoke());
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    return createRevokeHandler({
      revoke: () => getRevokePort().revoke(mandateIdForRevocation()),
      resolveIdentity: async (currentRequest) =>
        (
          await resolveWalletIdentity({
            request: currentRequest,
            auth: services.auth,
          })
        ).address,
      appOrigin: requireAppOrigin(),
    })(request);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
