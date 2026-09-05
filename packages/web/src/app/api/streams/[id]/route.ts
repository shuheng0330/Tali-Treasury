import type { SalaryStreamView } from '@tali/shared';

import { resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import { getStreamService, streamsAreLive } from '../../../../server/streams/dependencies';
import { ServerError, toApiError } from '../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ReadStreamService = (streamId: string) => Promise<SalaryStreamView>;

export function createReadStreamHandler(service: ReadStreamService) {
  return async (_request: Request, context: RouteContext): Promise<Response> => {
    try {
      const { id } = await context.params;
      if (!id) {
        throw new ServerError('invalid_request', 400, 'A stream id is required');
      }
      return Response.json(await service(id));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const services = getBackendServices();
    const identity = await resolveWalletIdentity({ request, auth: services.auth });
    const mandateId = new URL(request.url).searchParams.get('payroll');
    if (!mandateId) throw new ServerError('invalid_request', 400, 'Select a registered payroll');
    /* Employers may inspect the stream they funded; only the withdrawal route
       requires the immutable employee role. The object itself is public Sui
       state, while this endpoint still scopes it to an authorized payroll. */
    const configuration = await services.payrollConfigurations.requireAuthorized(identity.address, mandateId);
    if (!streamsAreLive()) throw new ServerError('payment_configuration_failed', 503, 'Salary stream chain state is unavailable');
    const { id } = await context.params;
    if (!id) throw new ServerError('invalid_request', 400, 'A stream id is required');
    let stream: SalaryStreamView;
    try {
      stream = await getStreamService(configuration.view.packageId).read(id);
    } catch (error) {
      if (error instanceof ServerError) throw error;
      throw new ServerError('mandate_read_failed', 502, 'Salary stream state could not be read from Sui', { cause: error });
    }
    if (stream.mandateId !== configuration.view.mandateId || stream.employee !== configuration.view.employee) {
      throw new ServerError('payroll_forbidden', 403, 'This stream does not belong to the selected payroll');
    }
    return Response.json(stream);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
