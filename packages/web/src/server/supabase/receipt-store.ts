import { ServerError } from '../errors';
import type { ReceiptStore } from '../claims/ports';
import { buildReceiptObjectPath } from '../receipts/hash';

interface StorageError {
  message?: string;
}

interface StorageBucket {
  upload(
    path: string,
    bytes: Uint8Array,
    options: { contentType: string; upsert: true; cacheControl: string },
  ): Promise<{ error: StorageError | null }>;
  createSignedUrl(
    path: string,
    expiresInSeconds: number,
  ): Promise<{ data: { signedUrl?: string } | null; error: StorageError | null }>;
}

interface SupabaseStorageClient {
  storage: {
    from(bucket: string): StorageBucket;
  };
}

export function createSupabaseReceiptStore(
  client: SupabaseStorageClient,
  bucket = process.env.SUPABASE_RECEIPT_BUCKET?.trim() || 'receipts',
): ReceiptStore {
  if (!bucket) {
    throw new Error('Supabase receipt bucket is required');
  }

  return {
    async upload(input) {
      const path = buildReceiptObjectPath(
        input.eventId,
        input.receiptHash,
        input.mimeType,
      );
      const { error } = await client.storage.from(bucket).upload(path, input.bytes, {
        contentType: input.mimeType,
        upsert: true,
        cacheControl: '3600',
      });
      if (error) {
        throw new ServerError('storage_failed', 500, 'Receipt upload failed', {
          cause: error,
        });
      }
      return path;
    },

    async createSignedUrl(path, expiresInSeconds) {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw new ServerError(
          'storage_failed',
          500,
          'Receipt URL creation failed',
          { cause: error ?? undefined },
        );
      }
      return data.signedUrl;
    },
  };
}
