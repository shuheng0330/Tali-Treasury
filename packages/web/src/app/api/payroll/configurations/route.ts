import type { ListPayrollConfigurationsResponse } from '@tali/shared';

import { resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import { toApiError } from '../../../../server/errors';

export const runtime = 'nodejs';

export function createListPayrollConfigurationsHandler(deps: {
  resolveIdentity: (request: Request) => Promise<string>;
  list: (actor: string) => Promise<ListPayrollConfigurationsResponse['configurations']>;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const actor = await deps.resolveIdentity(request);
      const body: ListPayrollConfigurationsResponse = { configurations: await deps.list(actor) };
      return Response.json(body);
    } catch (error) {
      const serialized = toApiError(error);
      return Response.json(serialized.body, { status: serialized.status });
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    return createListPayrollConfigurationsHandler({
      resolveIdentity: async (currentRequest) => (await resolveWalletIdentity({ request: currentRequest, auth: services.auth })).address,
      list: services.payrollConfigurations.list,
    })(request);
  } catch (error) {
    const serialized = toApiError(error);
    return Response.json(serialized.body, { status: serialized.status });
  }
}
