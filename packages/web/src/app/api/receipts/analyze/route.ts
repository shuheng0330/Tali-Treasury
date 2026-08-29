import type { AnalyzeReceiptResponse } from '@tali/shared';

import type { AnalyzeReceiptInput } from '../../../../server/claims/services';
import { getBackendServices } from '../../../../server/dependencies';
import { ServerError, toApiError } from '../../../../server/errors';
import type { ReceiptMimeType } from '../../../../server/receipts/hash';

export const runtime = 'nodejs';

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const supportedMimeTypes = new Set<ReceiptMimeType>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type AnalyzeReceiptService = (
  input: AnalyzeReceiptInput,
) => Promise<AnalyzeReceiptResponse>;

function errorResponse(error: unknown): Response {
  const { body, status } = toApiError(error);
  return Response.json(body, { status });
}

export function createAnalyzeReceiptHandler(service: AnalyzeReceiptService) {
  return async (request: Request): Promise<Response> => {
    try {
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
        typeof submitter !== 'string' ||
        !submitter
      ) {
        throw new ServerError(
          'invalid_request',
          400,
          'receipt, eventId, and submitter are required',
        );
      }
      if (!supportedMimeTypes.has(receipt.type as ReceiptMimeType)) {
        throw new ServerError(
          'unsupported_receipt',
          415,
          'Receipt must be JPEG, PNG, or WebP',
        );
      }
      if (receipt.size === 0) {
        throw new ServerError('unsupported_receipt', 415, 'Receipt image is empty');
      }
      if (receipt.size > MAX_RECEIPT_BYTES) {
        throw new ServerError(
          'unsupported_receipt',
          413,
          'Receipt must not exceed 10 MiB',
        );
      }

      const bytes = new Uint8Array(await receipt.arrayBuffer());
      const response = await service({
        eventId,
        submitter,
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
  return createAnalyzeReceiptHandler((input) =>
    getBackendServices().analyzeReceipt(input),
  )(request);
}
