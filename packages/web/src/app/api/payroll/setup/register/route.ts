import { z } from 'zod';

import { assertSameOrigin, resolveWalletIdentity } from '../../../../../server/auth/session';
import { getBackendServices } from '../../../../../server/dependencies';
import { requireAppOrigin } from '../../../../../server/env';
import { ServerError, toApiError } from '../../../../../server/errors';
import { getPayrollRateReader } from '../../../../../server/payroll/dependencies';
import { assertPayrollEmployer } from '../../../../../server/payroll/setup';
import { registerPayrollSetupDigest } from '../../../../../server/payroll/setup-registration';
import { verifyPayrollSetupTransaction } from '../../../../../server/payroll/setup-verification';
import { createServerSupabaseClient } from '../../../../../server/supabase/client';
import { createSupabasePayrollSetupRepository } from '../../../../../server/supabase/payroll-setup-repository';

export const runtime = 'nodejs';
const schema = z.object({ digest: z.string().trim().min(32).max(128) }).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const appOrigin = requireAppOrigin();
    assertSameOrigin(request, appOrigin);
    const backend = getBackendServices();
    const identity = await resolveWalletIdentity({ request, auth: backend.auth });
    assertPayrollEmployer(identity.address);
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ServerError('invalid_request', 400, 'A valid transaction digest is required.');
    }

    const repository = createSupabasePayrollSetupRepository(createServerSupabaseClient() as never);
    return Response.json({ registration: await registerPayrollSetupDigest(
      repository,
      parsed.data.digest,
      () => verifyPayrollSetupTransaction({
        identity: identity.address,
        digest: parsed.data.digest,
        rates: getPayrollRateReader(),
      }),
    ) });
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
