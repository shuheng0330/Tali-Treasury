import { createHash } from 'node:crypto';

import { z } from 'zod';

const eventIdSchema = z.string().uuid();
const receiptHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const receiptMimeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);

const fileExtensionByMime = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type ReceiptMimeType = keyof typeof fileExtensionByMime;

export function hashReceipt(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) {
    throw new Error('receipt cannot be empty');
  }

  return createHash('sha256').update(bytes).digest('hex');
}

export function buildReceiptObjectPath(
  eventId: string,
  receiptHash: string,
  mimeType: string,
): string {
  const validEventId = eventIdSchema.parse(eventId);
  const validHash = receiptHashSchema.parse(receiptHash);
  const validMime = receiptMimeSchema.parse(mimeType);

  return `${validEventId}/${validHash}.${fileExtensionByMime[validMime]}`;
}
