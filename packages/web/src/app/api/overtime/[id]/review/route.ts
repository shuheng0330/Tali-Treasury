import { authorizeEmployerRequest } from '../../../../../server/auth/authorization';
import { resolveWalletIdentity } from '../../../../../server/auth/session';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';
import { getOvertimeService } from '../../../../../server/overtime/dependencies';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const services = getBackendServices();
    const reviewer = await authorizeEmployerRequest({
      request,
      appOrigin: services.appOrigin,
      resolveIdentity: async (currentRequest) =>
        (await resolveWalletIdentity({ request: currentRequest, auth: services.auth })).address,
    });

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
    }

    /* The path is the authority on which claim this is, so nothing in the
       body can name a different one. */
    const { id } = await context.params;
    if (!UUID.test(id)) {
      throw new ServerError('invalid_request', 400, 'An overtime claim id must be a uuid');
    }

    const claim = await getOvertimeService().reviewClaim(reviewer, id, body);
    return Response.json({ claim });
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
