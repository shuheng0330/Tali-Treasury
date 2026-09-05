import { z } from 'zod';

import { assertSameOrigin, resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../server/errors';
import {
  getTimesheetReader,
  MAX_TIMESHEET_IMAGE_BYTES,
  type OvertimeDraft,
  type TimesheetImage,
} from '../../../../server/overtime/timesheet';
import { hasExpectedImageSignature, isReceiptMimeType } from '../../../../server/receipts/hash';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = Math.ceil(MAX_TIMESHEET_IMAGE_BYTES / 3) * 4 + 1024;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

const requestSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

function decodeImage(imageBase64: string): Uint8Array {
  const payload = imageBase64.replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
  if (!BASE64.test(payload) || payload.length % 4 === 1) {
    throw new ServerError('invalid_request', 400, 'imageBase64 must be base64');
  }
  return new Uint8Array(Buffer.from(payload, 'base64'));
}

export function createAnalyzeTimesheetHandler(deps: {
  read: (image: TimesheetImage) => Promise<OvertimeDraft>;
  resolveIdentity: (request: Request) => Promise<string>;
  appOrigin: string;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const contentLength = Number(request.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        throw new ServerError('unsupported_receipt', 413, 'Timesheet must not exceed 10 MiB');
      }

      assertSameOrigin(request, deps.appOrigin);
      await deps.resolveIdentity(request);

      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
      }

      const parsed = requestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ServerError('invalid_request', 400, 'imageBase64 and mimeType are required');
      }
      if (!isReceiptMimeType(parsed.data.mimeType)) {
        throw new ServerError(
          'unsupported_receipt',
          415,
          'Timesheet must be JPEG, PNG, or WebP',
        );
      }

      const bytes = decodeImage(parsed.data.imageBase64);
      if (bytes.byteLength === 0) {
        throw new ServerError('unsupported_receipt', 415, 'Timesheet image is empty');
      }
      if (bytes.byteLength > MAX_TIMESHEET_IMAGE_BYTES) {
        throw new ServerError('unsupported_receipt', 413, 'Timesheet must not exceed 10 MiB');
      }
      if (!hasExpectedImageSignature(bytes, parsed.data.mimeType)) {
        throw new ServerError(
          'unsupported_receipt',
          415,
          'Timesheet bytes do not match the declared image type',
        );
      }

      const draft = await deps.read({ bytes, mimeType: parsed.data.mimeType });
      return Response.json({ draft });
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    return createAnalyzeTimesheetHandler({
      read: (image) => getTimesheetReader().read(image),
      resolveIdentity: async (currentRequest) =>
        (
          await resolveWalletIdentity({
            request: currentRequest,
            auth: services.auth,
          })
        ).address,
      appOrigin: services.appOrigin,
    })(request);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
