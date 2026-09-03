import type { ReconcileClaimResponse } from '@tali/shared';

import { assertSameOrigin, resolveWalletIdentity } from '../../../../../server/auth/session';
import { claimIdSchema } from '../../../../../server/claims/validation';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ReconcileService = (input: {
  claimId: string;
  processor: string;
  outcome: 'paid' | 'not_paid';
  digest?: string;
}) => Promise<ReconcileClaimResponse>;

type ResolveIdentity = (request: Request, legacyAddress?: string) => Promise<string>;

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

export function createReconcileClaimHandler(
  service: ReconcileService,
  resolveIdentity?: ResolveIdentity,
  appOrigin?: string,
) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ServerError('invalid_request', 400, 'The request body must be an object');
      }

      const { processor, outcome, digest, ...rest } = body as Record<string, unknown>;
      const unknown = Object.keys(rest);
      if (unknown.length > 0) {
        throw new ServerError('invalid_request', 400, `Unrecognized key: "${unknown[0]}"`);
      }
      if (processor !== undefined && (typeof processor !== 'string' || !SUI_ADDRESS.test(processor))) {
        throw new ServerError('invalid_request', 400, 'processor must be a canonical Sui address');
      }
      if (outcome !== 'paid' && outcome !== 'not_paid') {
        throw new ServerError('invalid_request', 400, 'outcome must be "paid" or "not_paid"');
      }
      if (digest !== undefined && typeof digest !== 'string') {
        throw new ServerError('invalid_request', 400, 'digest must be a string');
      }

      if (appOrigin) assertSameOrigin(request, appOrigin);
      const actor = resolveIdentity ? await resolveIdentity(request, processor) : processor;
      if (typeof actor !== 'string') {
        throw new ServerError('authentication_required', 401, 'A valid wallet session is required');
      }

      const { id } = await context.params;
      const claimId = claimIdSchema.safeParse(id);
      if (!claimId.success) {
        throw new ServerError('invalid_request', 400, 'A claim id must be a uuid');
      }

      return Response.json(
        await service({
          claimId: claimId.data,
          processor: actor,
          outcome,
          ...(digest === undefined ? {} : { digest }),
        }),
      );
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const services = getBackendServices();
    return createReconcileClaimHandler(
      (input) => services.reconcileClaim(input),
      async (currentRequest, legacyAddress) =>
        (
          await resolveWalletIdentity({
            request: currentRequest,
            auth: services.auth,
            legacyAddress,
          })
        ).address,
      services.appOrigin,
    )(request, context);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
