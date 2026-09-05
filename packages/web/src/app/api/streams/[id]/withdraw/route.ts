import type { SalaryStreamView, WithdrawEarnedResult } from '@tali/shared';

import { assertAuthorizedWallet } from '../../../../../server/auth/authorization';
import { assertSameOrigin, resolveWalletIdentity } from '../../../../../server/auth/session';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';
import { getStreamService, streamsAreLive } from '../../../../../server/streams/dependencies';
import { assertPayrollSignerOwner } from '../../../../../server/sui/payroll-executor';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export function createWithdrawHandler(deps: {
  read: (streamId: string) => Promise<SalaryStreamView>;
  withdraw: (streamId: string) => Promise<WithdrawEarnedResult>;
  resolveIdentity: (request: Request) => Promise<string>;
  appOrigin: string;
  authorize?: (actor: string, mandateId: string, stream: SalaryStreamView) => Promise<void>;
}) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    try {
      assertSameOrigin(request, deps.appOrigin);
      const actor = await deps.resolveIdentity(request);
      const { id } = await context.params;
      if (!id) {
        throw new ServerError('invalid_request', 400, 'A stream id is required');
      }
      const stream = await deps.read(id);
      assertAuthorizedWallet(actor, stream.employee);
      if (deps.authorize) {
        const mandateId = new URL(request.url).searchParams.get('payroll');
        if (!mandateId) throw new ServerError('invalid_request', 400, 'Select a registered payroll');
        await deps.authorize(actor, mandateId, stream);
      }

      /* A refused withdrawal is 200 with the abort code in the body. The
         contract declining is an answer, not a server failure, and the screen
         needs the code to say which rule spoke. */
      return Response.json(await deps.withdraw(id));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const services = getBackendServices();
    if (!streamsAreLive()) throw new ServerError('payment_configuration_failed', 503, 'Salary stream chain state is unavailable');
    assertSameOrigin(request, services.appOrigin);
    const actor = (await resolveWalletIdentity({ request, auth: services.auth })).address;
    const mandateId = new URL(request.url).searchParams.get('payroll');
    if (!mandateId) throw new ServerError('invalid_request', 400, 'Select a registered payroll');
    const configuration = await services.payrollConfigurations.requireAuthorized(actor, mandateId, 'employee');
    assertPayrollSignerOwner(configuration.snapshot.capOwnerWallet);
    const { id } = await context.params;
    if (!id) throw new ServerError('invalid_request', 400, 'A stream id is required');
    const streams = getStreamService(configuration.snapshot.packageId);
    let stream: SalaryStreamView;
    try {
      stream = await streams.read(id);
    } catch (error) {
      if (error instanceof ServerError) throw error;
      throw new ServerError('mandate_read_failed', 502, 'Salary stream state could not be read from Sui', { cause: error });
    }
    if (stream.mandateId !== configuration.view.mandateId || stream.employee !== configuration.view.employee || stream.employee !== actor) {
      throw new ServerError('payroll_forbidden', 403, 'This stream does not belong to the selected payroll and wallet');
    }
    try {
      return Response.json(await streams.withdraw(id));
    } catch (error) {
      if (error instanceof ServerError) throw error;
      throw new ServerError('payment_submission_uncertain', 502, 'The withdrawal outcome is unknown. Check Sui before trying again.', { cause: error });
    }
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
