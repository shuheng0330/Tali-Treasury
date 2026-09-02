import { ZodError } from 'zod';
import type { Claim } from '@tali/shared';

import { assertSameOrigin, resolveWalletIdentity } from '../../../../../server/auth/session';
import { parseResubmitClaimInput } from '../../../../../server/claims/validation';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ResubmitClaimService = (input: {
  claimId: string;
  submitter: string;
  merchant: string;
  amount: string;
  receiptDate: string;
  category: Claim['category'];
  description: string;
}) => Promise<{ claim: Claim; accepted: boolean }>;

type ResolveIdentity = (request: Request, legacyAddress?: string) => Promise<string>;

/** Names the field, so six required fields do not share one message. */
function invalidCorrection(error: ZodError): ServerError {
  const issue = error.issues[0];
  const field = issue?.path.join('.');
  return new ServerError(
    'invalid_request',
    400,
    field ? `${field}: ${issue?.message}` : 'Invalid correction',
    { cause: error },
  );
}

export function createResubmitClaimHandler(
  service: ResubmitClaimService,
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
      if (!body || typeof body !== 'object') {
        throw new ServerError('invalid_request', 400, 'A correction is required');
      }

      const submitted = (body as { submitter?: unknown }).submitter;
      if (submitted !== undefined && typeof submitted !== 'string') {
        throw new ServerError('invalid_request', 400, 'submitter must be a Sui address');
      }

      if (appOrigin) assertSameOrigin(request, appOrigin);
      const submitter = resolveIdentity
        ? await resolveIdentity(request, submitted)
        : submitted;
      if (typeof submitter !== 'string') {
        throw new ServerError(
          'authentication_required',
          401,
          'A valid wallet session is required',
        );
      }

      const { id } = await context.params;
      const { submitter: _legacy, ...corrections } = body as Record<string, unknown>;

      let parsed;
      try {
        parsed = parseResubmitClaimInput({ claimId: id, submitter, ...corrections });
      } catch (error) {
        if (error instanceof ZodError) throw invalidCorrection(error);
        throw error;
      }

      return Response.json(await service(parsed));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const services = getBackendServices();
    return createResubmitClaimHandler(
      (input) => services.resubmitClaim(input),
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
