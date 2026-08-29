import type { CreateClaimResponse } from '@tali/shared';

import { getBackendServices } from '../../../server/dependencies';
import { ServerError, toApiError } from '../../../server/errors';

export const runtime = 'nodejs';

type CreateClaimService = (input: unknown) => Promise<CreateClaimResponse>;

export function createClaimHandler(service: CreateClaimService) {
  return async (request: Request): Promise<Response> => {
    try {
      let input: unknown;
      try {
        input = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', {
          cause: error,
        });
      }

      return Response.json(await service(input), { status: 201 });
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  return createClaimHandler((input) => getBackendServices().createClaim(input))(request);
}
