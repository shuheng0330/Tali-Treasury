import type { ReconcileClaimResponse } from '@tali/shared';

import { assertSameOrigin, resolveWalletIdentity } from '../../../../../server/auth/session';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ReconcileClaimService = (input: {
  claimId: string;
  reconciler: string;
}) => Promise<ReconcileClaimResponse>;

type ResolveIdentity = (request: Request, legacyAddress?: string) => Promise<string>;

export function createReconcileClaimHandler(
  service: ReconcileClaimService,
  resolveIdentity?: ResolveIdentity,
  appOrigin?: string,
) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', {
          cause: error,
        });
      }
      const legacyAddress =
        body && typeof body === 'object' && 'reconciler' in body
          ? body.reconciler
          : undefined;
      if (legacyAddress !== undefined && typeof legacyAddress !== 'string') {
        throw new ServerError('invalid_request', 400, 'reconciler must be a wallet address');
      }

      if (appOrigin) assertSameOrigin(request, appOrigin);
      const actor = resolveIdentity
        ? await resolveIdentity(request, legacyAddress)
        : legacyAddress;
      if (typeof actor !== 'string') {
        throw new ServerError(
          'authentication_required',
          401,
          'A valid wallet session is required',
        );
      }

      const { id } = await context.params;
      return Response.json(await service({ claimId: id, reconciler: actor }));
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
