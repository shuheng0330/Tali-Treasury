import type { AnalyzeReceiptResponse } from '@tali/shared';

import type { AnalyzeReceiptInput } from '../../../../server/claims/services';
import { assertSameOrigin, resolveWalletIdentity } from '../../../../server/auth/session';
import { getBackendServices } from '../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../server/errors';
import {
  hasExpectedImageSignature,
  isReceiptMimeType,
  MAX_RECEIPT_IMAGE_BYTES,
  type ReceiptMimeType,
} from '../../../../server/receipts/hash';

export const runtime = 'nodejs';

const MAX_MULTIPART_BYTES = MAX_RECEIPT_IMAGE_BYTES + 1024 * 1024;

type AnalyzeReceiptService = (
  input: AnalyzeReceiptInput,
) => Promise<AnalyzeReceiptResponse>;

function errorResponse(error: unknown): Response {
  const { body, status } = toApiError(error);
  return Response.json(body, { status });
}

type ResolveIdentity = (request: Request, legacyAddress?: string) => Promise<string>;

export function createAnalyzeReceiptHandler(
  service: AnalyzeReceiptService,
  resolveIdentity?: ResolveIdentity,
  appOrigin?: string,
) {
  return async (request: Request): Promise<Response> => {
    try {
      const contentLength = Number(request.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
        throw new ServerError(
          'unsupported_receipt',
          413,
          'Receipt request must not exceed 11 MiB',
        );
      }

      let form: FormData;
      try {
        form = await request.formData();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected multipart form data', {
          cause: error,
        });
      }

      const receipt = form.get('receipt');
      const eventId = form.get('eventId');
      const submitter = form.get('submitter');
      if (
        !(receipt instanceof File) ||
        typeof eventId !== 'string' ||
        !eventId ||
        (submitter !== null && typeof submitter !== 'string')
      ) {
        throw new ServerError(
          'invalid_request',
          400,
          'receipt and eventId are required',
        );
      }
      if (!isReceiptMimeType(receipt.type)) {
        throw new ServerError(
          'unsupported_receipt',
          415,
          'Receipt must be JPEG, PNG, or WebP',
        );
      }
      if (receipt.size === 0) {
        throw new ServerError('unsupported_receipt', 415, 'Receipt image is empty');
      }
      if (receipt.size > MAX_RECEIPT_IMAGE_BYTES) {
        throw new ServerError(
          'unsupported_receipt',
          413,
          'Receipt must not exceed 10 MiB',
        );
      }

      const bytes = new Uint8Array(await receipt.arrayBuffer());
      if (!hasExpectedImageSignature(bytes, receipt.type)) {
        throw new ServerError(
          'unsupported_receipt',
          415,
          'Receipt bytes do not match the declared image type',
        );
      }
      if (appOrigin) assertSameOrigin(request, appOrigin);
      const actor = resolveIdentity
        ? await resolveIdentity(
            request,
            typeof submitter === 'string' ? submitter : undefined,
          )
        : submitter;
      if (typeof actor !== 'string' || !actor) {
        throw new ServerError('authentication_required', 401, 'A valid wallet session is required');
      }
      const response = await service({
        eventId,
        submitter: actor,
        bytes,
        mimeType: receipt.type as ReceiptMimeType,
      });
      return Response.json(response);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    return createAnalyzeReceiptHandler(
      (input) => services.analyzeReceipt(input),
      async (currentRequest, legacyAddress) =>
        (
          await resolveWalletIdentity({
            request: currentRequest,
            auth: services.auth,
            legacyAddress,
          })
        ).address,
      services.appOrigin,
    )(request);
  } catch (error) {
    return errorResponse(error);
  }
}
