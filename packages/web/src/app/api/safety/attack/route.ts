import { assertSameOrigin } from '../../../../server/auth/session';
import { requireDemoIdentityEnabled } from '../../../../server/demo-auth';
import { ServerError, toApiError } from '../../../../server/errors';
import { getSafetyService } from '../../../../server/safety/dependencies';
import { safetyAttackSchema } from '../../../../server/safety/validation';
import { requireAppOrigin } from '../../../../server/env';

export const runtime = 'nodejs';

/**
 * Submits a payment the app would normally never send.
 *
 * A refusal is a 200 carrying the contract's abort code: the contract saying no
 * is the result the caller asked for, not a server failure. Only a request that
 * never reached the contract answers with an error status.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    requireDemoIdentityEnabled();
    /* This route really does sign and submit, so it spends gas from the
       backend signer. Nothing off-origin gets to do that. */
    assertSameOrigin(request, requireAppOrigin());

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
    }

    const parsed = safetyAttackSchema.safeParse(body);
    if (!parsed.success) {
      throw new ServerError(
        'invalid_request',
        400,
        parsed.error.issues[0]?.message ?? 'Invalid attack request',
      );
    }

    return Response.json(await getSafetyService().attack(parsed.data));
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
