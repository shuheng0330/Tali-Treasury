import { assertSameOrigin, resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../server/errors';
import type { ManualDraftInput } from '../../../../server/claims/manual';

export const runtime = 'nodejs';

/**
 * A claim typed rather than photographed.
 *
 * The sibling `/api/receipts/analyze` takes an image and hands back a draft;
 * this takes the fields and hands back the same draft, so the submit step after
 * it is the one that already exists. The difference is entirely in what the
 * draft says about itself — see `server/claims/manual.ts`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    assertSameOrigin(request, services.appOrigin);
    const identity = await resolveWalletIdentity({ request, auth: services.auth });

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
    }

    if (typeof body !== 'object' || body === null) {
      throw new ServerError('invalid_request', 400, 'Expected the claim details');
    }

    /* The service validates every field; the wallet is the one value a caller
       does not get to choose, so it is written over whatever arrived. */
    const response = await services.createManualDraft({
      ...(body as ManualDraftInput),
      submitter: identity.address,
    });

    return Response.json(response, { status: 201 });
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
