import type { WithdrawEarnedResult } from '@tali/shared';

import { requireDemoIdentityEnabled } from '../../../../../server/demo-auth';
import { getStreamService } from '../../../../../server/streams/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type WithdrawService = (streamId: string) => Promise<WithdrawEarnedResult>;

export function createWithdrawHandler(service: WithdrawService) {
  return async (_request: Request, context: RouteContext): Promise<Response> => {
    try {
      const { id } = await context.params;
      if (!id) {
        throw new ServerError('invalid_request', 400, 'A stream id is required');
      }

      /* A refused withdrawal is 200 with the abort code in the body. The
         contract declining is an answer, not a server failure, and the screen
         needs the code to say which rule spoke. */
      return Response.json(await service(id));
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
    requireDemoIdentityEnabled();
    return createWithdrawHandler((streamId) =>
      getStreamService().withdraw(streamId),
    )(request, context);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
