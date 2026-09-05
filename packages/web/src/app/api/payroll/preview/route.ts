import { resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../server/errors';
import { getPayrollService } from '../../../../server/payroll/dependencies';
import { payrollRequestSchema } from '../../../../server/payroll/validation';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    const identity = await resolveWalletIdentity({ request, auth: services.auth });

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

    return Response.json(await getPayrollService().preview(identity.address, parsed.data));
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
