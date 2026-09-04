import type { SafetyAttackRequest } from '@tali/shared';

import {
  authorizeEmployerRequest,
  type ResolveRequestIdentity,
} from '../../../../server/auth/authorization';
import { resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import type { EnvLike } from '../../../../server/env';
import { requireAppOrigin } from '../../../../server/env';
import { ServerError, toApiError } from '../../../../server/errors';
import { getSafetyService } from '../../../../server/safety/dependencies';
import { safetyAttackSchema } from '../../../../server/safety/validation';

export const runtime = 'nodejs';

/**
 * Submits a payment the app would normally never send.
 *
 * A refusal is a 200 carrying the contract's abort code: the contract saying no
 * is the result the caller asked for, not a server failure. Only a request that
 * never reached the contract answers with an error status.
 */
export function createSafetyAttackHandler(deps: {
  submitAttack: (input: SafetyAttackRequest) => Promise<unknown>;
  resolveIdentity: ResolveRequestIdentity;
  appOrigin: string;
  env?: EnvLike;
}) {
  return async function safetyAttackHandler(request: Request): Promise<Response> {
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

      const parsed = safetyAttackSchema.safeParse(body);
      if (!parsed.success) {
        throw new ServerError(
          'invalid_request',
          400,
          parsed.error.issues[0]?.message ?? 'Invalid attack request',
        );
      }

      return Response.json(await deps.submitAttack(parsed.data));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    return createSafetyAttackHandler({
      submitAttack: (input) => getSafetyService().attack(input),
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
