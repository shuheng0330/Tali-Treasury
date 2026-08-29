import { describe, expect, it, vi } from 'vitest';

import { createSupabaseReceiptStore } from './receipt-store';

const eventId = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
const receiptHash = 'a'.repeat(64);

describe('createSupabaseReceiptStore', () => {
  it('uploads immutable private bytes with safe storage options', async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upload, createSignedUrl: vi.fn() }));
    const store = createSupabaseReceiptStore({ storage: { from } }, 'receipts');

    await expect(
      store.upload({
        eventId,
        receiptHash,
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/png',
      }),
    ).resolves.toBe(`${eventId}/${receiptHash}.png`);
    expect(from).toHaveBeenCalledWith('receipts');
    expect(upload).toHaveBeenCalledWith(
      `${eventId}/${receiptHash}.png`,
      expect.any(Uint8Array),
      { contentType: 'image/png', upsert: false, cacheControl: '3600' },
    );
  });

  it('creates short-lived signed URLs from private object paths', async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://signed.example/receipt' },
      error: null,
    }));
    const store = createSupabaseReceiptStore({
      storage: { from: vi.fn(() => ({ upload: vi.fn(), createSignedUrl })) },
    });

    await expect(store.createSignedUrl('private/path.png', 300)).resolves.toBe(
      'https://signed.example/receipt',
    );
    expect(createSignedUrl).toHaveBeenCalledWith('private/path.png', 300);
  });

  it('sanitizes storage failures', async () => {
    const store = createSupabaseReceiptStore({
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(async () => ({ error: { message: 'secret internal detail' } })),
          createSignedUrl: vi.fn(),
        })),
      },
    });

    const result = store.upload({
      eventId,
      receiptHash,
      bytes: new Uint8Array([1]),
      mimeType: 'image/png',
    });
    await expect(result).rejects.toMatchObject({ code: 'storage_failed' });
    await expect(result).rejects.not.toThrow('secret internal detail');
  });
});
