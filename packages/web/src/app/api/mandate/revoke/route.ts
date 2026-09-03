import { z } from 'zod';

import { assertSameOrigin } from '../../../../server/auth/session';
import { requireDemoIdentityEnabled } from '../../../../server/demo-auth';
import { ServerError, toApiError } from '../../../../server/errors';
import { getRevokePort, mandateIdForRevocation } from '../../../../server/mandate/dependencies';
import { requireAppOrigin } from '../../../../server/env';

export const runtime = 'nodejs';

const revokeSchema = z
  .object({
    /* The event name, typed out by the treasurer. Revocation cannot be undone
       and stops every payment from this mandate, so it does not happen on one
       click landing in the wrong place. */
    confirm: z.string().trim().min(1),
    expected: z.string().trim().min(1),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  try {
    requireDemoIdentityEnabled();
    /* Revocation cannot be undone and stops every payment from the mandate.
       Both halves of the typed confirmation come from the request body, so
       without this the whole guard is one a foreign page can satisfy. */
    assertSameOrigin(request, requireAppOrigin());

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
    }

    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ServerError('invalid_request', 400, 'A typed confirmation is required');
    }
    if (parsed.data.confirm !== parsed.data.expected) {
      throw new ServerError(
        'invalid_request',
        400,
        'The typed confirmation does not match the event name',
      );
    }

    return Response.json(await getRevokePort().revoke(mandateIdForRevocation()));
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
