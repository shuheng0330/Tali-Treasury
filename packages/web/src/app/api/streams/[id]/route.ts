import type { SalaryStreamView } from '@tali/shared';

import { requireDemoIdentityEnabled } from '../../../../server/demo-auth';
import { getStreamService } from '../../../../server/streams/dependencies';
import { ServerError, toApiError } from '../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ReadStreamService = (streamId: string) => Promise<SalaryStreamView>;

export function createReadStreamHandler(service: ReadStreamService) {
  return async (_request: Request, context: RouteContext): Promise<Response> => {
    try {
      const { id } = await context.params;
      if (!id) {
        throw new ServerError('invalid_request', 400, 'A stream id is required');
      }
      return Response.json(await service(id));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    requireDemoIdentityEnabled();
    return createReadStreamHandler((streamId) =>
      getStreamService().read(streamId),
    )(request, context);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
