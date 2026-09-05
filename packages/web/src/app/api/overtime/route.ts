import { assertSameOrigin, resolveWalletIdentity } from '../../../server/auth/session';
import { getBackendServices } from '../../../server/dependencies';
import { ServerError, toApiError } from '../../../server/errors';
import {
  getOvertimeService,
  overtimeIsPersisted,
} from '../../../server/overtime/dependencies';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    const identity = await resolveWalletIdentity({ request, auth: services.auth });
    const claims = await getOvertimeService().listClaims(identity.address);
    /* An empty list from a store that is not durable is not the same answer
       as an empty list from one that is. The screen says which it read. */
    const storage = overtimeIsPersisted();
    return Response.json({ claims, persisted: storage.persisted, reason: storage.reason });
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    assertSameOrigin(request, services.appOrigin);
    const identity = await resolveWalletIdentity({ request, auth: services.auth });

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
    }

    const claim = await getOvertimeService().submitClaim(identity.address, body);
    return Response.json({ claim }, { status: 201 });
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
