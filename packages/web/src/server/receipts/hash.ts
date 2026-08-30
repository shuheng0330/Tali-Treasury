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

export const MAX_RECEIPT_IMAGE_BYTES = 10 * 1024 * 1024;
export const RECEIPT_MIME_TYPES: readonly ReceiptMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export function isReceiptMimeType(value: string): value is ReceiptMimeType {
  return RECEIPT_MIME_TYPES.includes(value as ReceiptMimeType);
}

export function hasExpectedImageSignature(
  bytes: Uint8Array,
  mimeType: ReceiptMimeType,
): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
}

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
