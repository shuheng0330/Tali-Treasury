import { z } from 'zod';

import { requireDemoIdentityEnabled } from '../../../../../server/demo-auth';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const paySchema = z
  .object({ processor: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, 'invalid Sui address') })
  .strict();

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    requireDemoIdentityEnabled();

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
    }

    const parsed = paySchema.safeParse(body);
    if (!parsed.success) {
      throw new ServerError('invalid_request', 400, 'processor is required');
    }

    const { id } = await context.params;
    if (!id) throw new ServerError('invalid_request', 400, 'A claim id is required');

    /* A payment the contract refuses is a 200 carrying the reason: the claim
       moved to payment_failed and the caller needs to see why. */
    return Response.json(
      await getBackendServices().payApprovedClaim({ claimId: id, ...parsed.data }),
    );
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
