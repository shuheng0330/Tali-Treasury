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
    const requests = await getOvertimeService().listLeave(identity.address);
    const storage = overtimeIsPersisted();
    return Response.json({ requests, persisted: storage.persisted, reason: storage.reason });
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

    const leaveRequest = await getOvertimeService().submitLeave(identity.address, body);
    return Response.json({ request: leaveRequest }, { status: 201 });
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
