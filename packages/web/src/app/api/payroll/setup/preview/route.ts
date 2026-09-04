import { z } from 'zod';

import { assertSameOrigin, resolveWalletIdentity } from '../../../../../server/auth/session';
import { getBackendServices } from '../../../../../server/dependencies';
import { requireAppOrigin } from '../../../../../server/env';
import { ServerError, toApiError } from '../../../../../server/errors';
import { getPayrollRateReader } from '../../../../../server/payroll/dependencies';
import { createPayrollSetupPreview } from '../../../../../server/payroll/setup';

export const runtime = 'nodejs';

const schema = z.object({
  employee: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
  expiryMs: z.number().int().positive(),
}).strict();

type PreviewService = (input: {
  identity: string;
  employee: string;
  expiryMs: number;
}) => Promise<unknown>;

export function createPayrollSetupPreviewHandler(input: {
  preview: PreviewService;
  resolveIdentity: (request: Request) => Promise<string>;
  appOrigin: string;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      assertSameOrigin(request, input.appOrigin);
      const identity = await input.resolveIdentity(request);
      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new ServerError(
          'invalid_request',
          400,
          parsed.error.issues[0]?.message ?? 'Invalid payroll setup',
        );
      }
      return Response.json(await input.preview({ identity, ...parsed.data }));
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const backend = getBackendServices();
    return createPayrollSetupPreviewHandler({
      appOrigin: requireAppOrigin(),
      resolveIdentity: async (currentRequest) => (
        await resolveWalletIdentity({ request: currentRequest, auth: backend.auth })
      ).address,
      preview: (input) => createPayrollSetupPreview({
        ...input,
        rates: getPayrollRateReader(),
      }),
    })(request);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
