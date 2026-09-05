import { authorizeEmployerRequest } from '../../../../server/auth/authorization';
import { resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import type { EnvLike } from '../../../../server/env';
import { ServerError, toApiError } from '../../../../server/errors';
import {
  getPayrollService,
  payrollRunsArePersisted,
} from '../../../../server/payroll/dependencies';
import {
  payrollRequestSchema,
  type PayrollRequest,
} from '../../../../server/payroll/validation';

export const runtime = 'nodejs';

export function createPayrollRunsPostHandler(deps: {
  run: (actor: string, input: PayrollRequest) => Promise<unknown>;
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
      if (!parsed.data.mandateId) {
        throw new ServerError('invalid_request', 400, 'Select a registered payroll');
      }

      /* A run that the contract refuses comes back as a normal result carrying
         its abort code. Only a request that never reached the contract is an
         error status. */
      return Response.json(await deps.run(actor, parsed.data), { status: 201 });
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    return createPayrollRunsPostHandler({
      run: (actor, input) => getPayrollService().run(actor, input),
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

export async function GET(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    const identity = await resolveWalletIdentity({ request, auth: services.auth });
    const mandateId = new URL(request.url).searchParams.get('payroll');
    if (!mandateId) throw new ServerError('invalid_request', 400, 'Select a registered payroll');
    const runs = await getPayrollService().listRecent(identity.address, mandateId, 20);
    /* An empty list from a store that is not durable is not the same answer as
       an empty list from one that is. Without this the endpoint reports
       success over runs that vanish with the process. */
    const storage = payrollRunsArePersisted();
    return Response.json({
      runs,
      persisted: storage.persisted,
      ...(storage.reason ? { storageWarning: storage.reason } : {}),
    });
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
