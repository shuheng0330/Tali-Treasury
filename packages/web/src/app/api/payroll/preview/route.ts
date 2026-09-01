import { requireDemoIdentityEnabled } from '../../../../server/demo-auth';
import { ServerError, toApiError } from '../../../../server/errors';
import { getPayrollService } from '../../../../server/payroll/dependencies';
import { payrollRequestSchema } from '../../../../server/payroll/validation';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    requireDemoIdentityEnabled();

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

    return Response.json(getPayrollService().preview(parsed.data));
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
