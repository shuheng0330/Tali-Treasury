import type { CreateWalletChallengeResponse } from '@tali/shared';

import { assertSameOrigin } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../server/errors';

export const runtime = 'nodejs';

type IssueChallenge = (input: unknown) => Promise<CreateWalletChallengeResponse>;

export function createWalletChallengeHandler(
  issueChallenge: IssueChallenge,
  appOrigin: string,
) {
  return async (request: Request): Promise<Response> => {
    try {
      assertSameOrigin(request, appOrigin);
      let input: unknown;
      try {
        input = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', {
          cause: error,
        });
      }
      return Response.json(await issueChallenge(input));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    return createWalletChallengeHandler(
      services.issueWalletChallenge,
      services.appOrigin,
    )(request);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
