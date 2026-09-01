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

    /* A run that the contract refuses comes back as a normal result carrying
       its abort code. Only a request that never reached the contract is an
       error status. */
    return Response.json(await getPayrollService().run(parsed.data), { status: 201 });
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}

export async function GET(): Promise<Response> {
  try {
    requireDemoIdentityEnabled();
    return Response.json({ runs: await getPayrollService().listRecent(20) });
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
