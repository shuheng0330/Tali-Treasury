import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '@tali/shared';

import { requireDemoIdentityEnabled } from '../../../../../server/demo-auth';
import { getBackendServices } from '../../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../../server/errors';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const [first, ...rest] = EXPENSE_CATEGORIES;

const resubmitSchema = z
  .object({
    submitter: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, 'invalid Sui address'),
    merchant: z.string().trim().min(1).max(200),
    amount: z
      .string()
      .regex(/^[0-9]{1,30}$/, 'amount must be base units')
      .refine((value) => BigInt(value) > 0n, 'amount must be greater than zero'),
    receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'receiptDate must be YYYY-MM-DD'),
    category: z.enum([first!, ...rest]),
    description: z.string().trim().max(500),
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

    const parsed = resubmitSchema.safeParse(body);
    if (!parsed.success) {
      throw new ServerError(
        'invalid_request',
        400,
        parsed.error.issues[0]?.message ?? 'Invalid correction',
      );
    }

    const { id } = await context.params;
    if (!id) throw new ServerError('invalid_request', 400, 'A claim id is required');

    return Response.json(
      await getBackendServices().resubmitClaim({ claimId: id, ...parsed.data }),
    );
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
