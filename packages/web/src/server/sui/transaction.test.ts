import { TransactionError } from '@mysten/sui/client';
import { describe, expect, it, vi } from 'vitest';

import { readTransaction } from './transaction';

const digest = '4'.repeat(44);

describe('readTransaction', () => {
  it('maps an executed transaction with effects', async () => {
    const client = {
      getTransaction: vi.fn(async () => ({
        $kind: 'Transaction' as const,
        Transaction: {
          digest,
          checkpoint: '456',
          status: { success: true as const, error: null },
          effects: {
            gasUsed: {
              computationCost: '10',
              storageCost: '5',
              storageRebate: '2',
              nonRefundableStorageFee: '1',
            },
          },
        },
      })),
    };

    await expect(readTransaction(client, digest)).resolves.toEqual({
      digest,
      checkpoint: '456',
      status: { success: true, error: null },
      gasUsed: {
        computationCost: '10',
        storageCost: '5',
        storageRebate: '2',
        nonRefundableStorageFee: '1',
      },
    });
    expect(client.getTransaction).toHaveBeenCalledWith({
      digest,
      include: { effects: true },
    });
  });

  it('returns null only for a transaction-not-found response', async () => {
    const client = {
      getTransaction: vi.fn(async () => {
        throw new TransactionError('notFound', digest);
      }),
    };

    await expect(readTransaction(client, digest)).resolves.toBeNull();
  });

  it('does not hide transport failures as pending transactions', async () => {
    const client = {
      getTransaction: vi.fn(async () => {
        throw new Error('rpc unavailable');
      }),
    };

    await expect(readTransaction(client, digest)).rejects.toThrow('rpc unavailable');
  });
});
