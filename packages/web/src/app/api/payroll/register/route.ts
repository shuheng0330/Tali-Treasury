import type { RegisterPayrollResponse } from '@tali/shared';

import { authorizeEmployerRequest } from '../../../../server/auth/authorization';
import { resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import type { EnvLike } from '../../../../server/env';
import { ServerError, toApiError } from '../../../../server/errors';

export const runtime = 'nodejs';

interface RegistrationResult {
  created: boolean;
  response: RegisterPayrollResponse;
}

export function createPayrollRegisterHandler(deps: {
  register: (input: { actor: string; request: unknown }) => Promise<RegistrationResult>;
  resolveIdentity: (request: Request) => Promise<string>;
  appOrigin: string;
  env?: EnvLike;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const actor = await authorizeEmployerRequest({
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
      const result = await deps.register({ actor, request: body });
      return Response.json(result.response, { status: result.created ? 201 : 200 });
    } catch (error) {
      const serialized = toApiError(error);
      return Response.json(serialized.body, { status: serialized.status });
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    return createPayrollRegisterHandler({
      register: services.registerPayroll,
      resolveIdentity: async (currentRequest) => (
        await resolveWalletIdentity({ request: currentRequest, auth: services.auth })
      ).address,
      appOrigin: services.appOrigin,
    })(request);
  } catch (error) {
    const serialized = toApiError(error);
    return Response.json(serialized.body, { status: serialized.status });
  }
}
