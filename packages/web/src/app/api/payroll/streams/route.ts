import type {
  OpenSalaryStreamRequest,
  SalaryStreamRegistrationResponse,
} from '@tali/shared';
import { z } from 'zod';

import { authorizeEmployerRequest } from '../../../../server/auth/authorization';
import { resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import type { EnvLike } from '../../../../server/env';
import { ServerError, toApiError } from '../../../../server/errors';
import { suiAddressSchema } from '../../../../server/claims/validation';
import { getSalaryStreamOpeningService } from '../../../../server/streams/opening-dependencies';

export const runtime = 'nodejs';

const requestSchema = z.object({
  mandateId: suiAddressSchema,
  totalAmount: z.string().regex(/^[1-9][0-9]*$/),
  durationMinutes: z.number().int().min(1).max(1_440),
}).strict();

export interface HandlerDependencies {
  resolveIdentity(request: Request): Promise<string>;
  find(actor: string, mandateId: string): Promise<SalaryStreamRegistrationResponse['stream']>;
  open(actor: string, request: OpenSalaryStreamRequest): Promise<NonNullable<SalaryStreamRegistrationResponse['stream']>>;
  appOrigin: string;
  env?: EnvLike;
}

export function createSalaryStreamRouteHandlers(deps: HandlerDependencies) {
  return {
    async get(request: Request): Promise<Response> {
      try {
        const actor = await deps.resolveIdentity(request);
        const mandateId = new URL(request.url).searchParams.get('payroll');
        if (!mandateId) throw new ServerError('invalid_request', 400, 'Select a registered payroll');
        return Response.json({ stream: await deps.find(actor, mandateId) } satisfies SalaryStreamRegistrationResponse);
      } catch (error) {
        const serialized = toApiError(error);
        return Response.json(serialized.body, { status: serialized.status });
      }
    },
    async post(request: Request): Promise<Response> {
      try {
        const actor = await authorizeEmployerRequest({
          request,
          appOrigin: deps.appOrigin,
          resolveIdentity: deps.resolveIdentity,
          env: deps.env,
        });
        let body: unknown;
        try { body = await request.json(); } catch (error) {
          throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
        }
        const parsed = requestSchema.safeParse(body);
        if (!parsed.success) {
          throw new ServerError('invalid_request', 400, parsed.error.issues[0]?.message ?? 'Invalid stream request');
        }
        return Response.json({ stream: await deps.open(actor, parsed.data) } satisfies SalaryStreamRegistrationResponse, { status: 201 });
      } catch (error) {
        const serialized = toApiError(error);
        return Response.json(serialized.body, { status: serialized.status });
      }
    },
  };
}

function dependencies(): HandlerDependencies {
  const services = getBackendServices();
  const opening = getSalaryStreamOpeningService(services.payrollConfigurations);
  return {
    resolveIdentity: async (request) => (await resolveWalletIdentity({ request, auth: services.auth })).address,
    find: opening.find,
    open: opening.open,
    appOrigin: services.appOrigin,
  };
}

export async function GET(request: Request): Promise<Response> {
  try { return createSalaryStreamRouteHandlers(dependencies()).get(request); }
  catch (error) { const serialized = toApiError(error); return Response.json(serialized.body, { status: serialized.status }); }
}

export async function POST(request: Request): Promise<Response> {
  try { return createSalaryStreamRouteHandlers(dependencies()).post(request); }
  catch (error) { const serialized = toApiError(error); return Response.json(serialized.body, { status: serialized.status }); }
}
