import type { AnalyzeReceiptResponse } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../server/errors';
import { createAnalyzeReceiptHandler } from './route';

const eventId = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
const submitter = `0x${'a'.repeat(64)}`;
const receiptHash = 'a'.repeat(64);
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const response: AnalyzeReceiptResponse = {
  analysis: {
    merchant: 'Campus Print Shop',
    amount: '4500000',
    currency: 'MYR',
    receiptDate: '2026-08-30',
    category: 'printing',
    confidence: 0.96,
    uncertainFields: [],
    warnings: [],
    receiptHash,
    fuzzyKey: 'campus print shop|2026-08-30|4500000',
  },
  storagePath: `${eventId}/${receiptHash}.png`,
  duplicateOf: null,
};

function multipartRequest(options?: {
  includeReceipt?: boolean;
  mimeType?: string;
  bytes?: Uint8Array;
}): Request {
  const form = new FormData();
  form.set('eventId', eventId);
  form.set('submitter', submitter);
  if (options?.includeReceipt !== false) {
    const sourceBytes = options?.bytes ?? pngBytes;
    const fileBuffer = new ArrayBuffer(sourceBytes.byteLength);
    new Uint8Array(fileBuffer).set(sourceBytes);
    form.set(
      'receipt',
      new File([fileBuffer], 'receipt.png', {
        type: options?.mimeType ?? 'image/png',
      }),
    );
  }
  return new Request('http://localhost/api/receipts/analyze', {
    method: 'POST',
    body: form,
  });
}

describe('POST /api/receipts/analyze', () => {
  it('parses multipart fields and forwards exact receipt bytes', async () => {
    const service = vi.fn(async () => response);
    const handler = createAnalyzeReceiptHandler(service);

    const result = await handler(multipartRequest());

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual(response);
    expect(service).toHaveBeenCalledWith({
      eventId,
      submitter,
      bytes: pngBytes,
      mimeType: 'image/png',
    });
  });

  it('rejects missing files and unsupported media before service execution', async () => {
    const service = vi.fn();
    const handler = createAnalyzeReceiptHandler(service);

    const missing = await handler(multipartRequest({ includeReceipt: false }));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({ error: 'invalid_request' });

    const unsupported = await handler(multipartRequest({ mimeType: 'application/pdf' }));
    expect(unsupported.status).toBe(415);
    await expect(unsupported.json()).resolves.toMatchObject({
      error: 'unsupported_receipt',
    });
    expect(service).not.toHaveBeenCalled();
  });

  it('rejects receipts larger than 10 MiB', async () => {
    const handler = createAnalyzeReceiptHandler(vi.fn());
    const result = await handler(
      multipartRequest({ bytes: new Uint8Array(10 * 1024 * 1024 + 1) }),
    );

    expect(result.status).toBe(413);
    await expect(result.json()).resolves.toMatchObject({ error: 'unsupported_receipt' });
  });

  it('rejects image metadata that does not match the uploaded bytes', async () => {
    const service = vi.fn();
    const handler = createAnalyzeReceiptHandler(service);
    const result = await handler(
      multipartRequest({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }),
    );

    expect(result.status).toBe(415);
    await expect(result.json()).resolves.toMatchObject({ error: 'unsupported_receipt' });
    expect(service).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared request before multipart parsing', async () => {
    const service = vi.fn();
    const handler = createAnalyzeReceiptHandler(service);
    const result = await handler(
      new Request('http://localhost/api/receipts/analyze', {
        method: 'POST',
        headers: { 'content-length': String(12 * 1024 * 1024) },
      }),
    );

    expect(result.status).toBe(413);
    expect(service).not.toHaveBeenCalled();
  });

  it('maps known errors and sanitizes unexpected errors', async () => {
    const known = createAnalyzeReceiptHandler(
      vi.fn(async () => {
        throw new ServerError('member_not_found', 403, 'Active membership required');
      }),
    );
    const knownResult = await known(multipartRequest());
    expect(knownResult.status).toBe(403);
    await expect(knownResult.json()).resolves.toEqual({
      error: 'member_not_found',
      message: 'Active membership required',
    });

    const unexpected = createAnalyzeReceiptHandler(
      vi.fn(async () => {
        throw new Error('secret internal detail');
      }),
    );
    const unexpectedResult = await unexpected(multipartRequest());
    expect(unexpectedResult.status).toBe(500);
    const body = await unexpectedResult.json();
    expect(body).toMatchObject({ error: 'database_failed' });
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
  });
});
