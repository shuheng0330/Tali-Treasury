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

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

/* A string that is not an address is a bad request, not a bad session. Letting
   it fall through to the identity resolver told the caller their wallet
   session was invalid when what they sent was a malformed address. */
function legacyAddress(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !SUI_ADDRESS.test(value)) {
    throw new ServerError('invalid_request', 400, `${field} must be a canonical Sui address`);
  }
  return value;
}


/** Names the field, so six required fields do not share one message. */
function invalidCorrection(error: ZodError): ServerError {
  const issue = error.issues[0];
  /* An unrecognised key carries an empty path and names the offender in `keys`
     instead, so falling back to the generic message here would drop the one
     detail the caller needs. */
  const unrecognized =
    issue?.code === 'unrecognized_keys' ? (issue as { keys?: string[] }).keys : undefined;
  if (unrecognized?.length) {
    return new ServerError(
      'invalid_request',
      400,
      `Unrecognized key: "${unrecognized[0]}"`,
      { cause: error },
    );
  }

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
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ServerError('invalid_request', 400, 'A correction must be an object');
      }

      const submitted = legacyAddress(
        (body as { submitter?: unknown }).submitter,
        'submitter',
      );

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
      /* The path is the authority on which claim this is. `claimId` is dropped
         from the body so it cannot name a different one. */
      const {
        submitter: _legacy,
        claimId: _path,
        ...corrections
      } = body as Record<string, unknown>;

      let parsed;
      try {
        parsed = parseResubmitClaimInput({ ...corrections, claimId: id, submitter });
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
