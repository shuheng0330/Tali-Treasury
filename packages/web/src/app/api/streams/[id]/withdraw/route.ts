import type { SalaryStreamView, WithdrawEarnedResult } from '@tali/shared';

import { assertAuthorizedWallet } from '../../../../../server/auth/authorization';
import { assertSameOrigin, resolveWalletIdentity } from '../../../../../server/auth/session';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';
import { getStreamService } from '../../../../../server/streams/dependencies';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export function createWithdrawHandler(deps: {
  read: (streamId: string) => Promise<SalaryStreamView>;
  withdraw: (streamId: string) => Promise<WithdrawEarnedResult>;
  resolveIdentity: (request: Request) => Promise<string>;
  appOrigin: string;
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
    const streams = getStreamService();
    return createWithdrawHandler({
      read: (streamId) => streams.read(streamId),
      withdraw: (streamId) => streams.withdraw(streamId),
      resolveIdentity: async (currentRequest) =>
        (
          await resolveWalletIdentity({
            request: currentRequest,
            auth: services.auth,
          })
        ).address,
      appOrigin: services.appOrigin,
    })(request, context);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
