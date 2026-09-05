import { authorizeEmployerRequest } from '../../../../server/auth/authorization';
import { resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import type { EnvLike } from '../../../../server/env';
import { ServerError, toApiError } from '../../../../server/errors';
import { getPayrollService } from '../../../../server/payroll/dependencies';
import {
  payrollRequestSchema,
  type PayrollRequest,
} from '../../../../server/payroll/validation';

export const runtime = 'nodejs';

export function createPayrollPreviewPostHandler(deps: {
  preview: (actor: string, input: PayrollRequest) => Promise<unknown>;
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

      const parsed = payrollRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ServerError(
          'invalid_request',
          400,
          parsed.error.issues[0]?.message ?? 'Invalid payroll request',
        );
      }

      return Response.json(await deps.preview(actor, parsed.data));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    return createPayrollPreviewPostHandler({
      preview: (actor, input) => getPayrollService().preview(actor, input),
      resolveIdentity: async (currentRequest) =>
        (
          await resolveWalletIdentity({
            request: currentRequest,
            auth: services.auth,
          })
        ).address,
      appOrigin: services.appOrigin,
    })(request);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
