import { z } from 'zod';

import { requireDemoIdentityEnabled } from '../../../../../server/demo-auth';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const reviewSchema = z
  .object({
    reviewer: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, 'invalid Sui address'),
    action: z.enum(['approve', 'reject', 'request_correction']),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    requireDemoIdentityEnabled();

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
    }

    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new ServerError(
        'invalid_request',
        400,
        parsed.error.issues[0]?.message ?? 'Invalid review',
      );
    }

    const { id } = await context.params;
    if (!id) throw new ServerError('invalid_request', 400, 'A claim id is required');

    return Response.json(
      await getBackendServices().reviewClaim({ claimId: id, ...parsed.data }),
    );
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
