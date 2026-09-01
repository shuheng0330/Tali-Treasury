import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, it, vi } from 'vitest';
import type { SalaryStreamState } from '@tali/treasury-sui';

import { createSuiStreamChain, type StreamOperations } from './stream-chain';
import type { ConfirmedTransaction } from './transaction';

const keypair = Ed25519Keypair.generate();
const env = {
  AGENT_PRIVATE_KEY: keypair.getSecretKey(),
  PAYROLL_PACKAGE_ID: `0x${'6'.repeat(64)}`,
  SUI_NETWORK: 'testnet',
};

const streamId = `0x${'8'.repeat(64)}`;

function stream(withdrawn: bigint): SalaryStreamState {
  return {
    id: streamId,
    coinType: '0x2::sui::SUI',
    mandateId: `0x${'5'.repeat(64)}`,
    employee: `0x${'7'.repeat(64)}`,
    totalAmount: 3_000_000000n,
    startedAtMs: 1_000n,
    endsAtMs: 2_000n,
    withdrawn,
  };
}

function confirmed(overrides: Partial<ConfirmedTransaction> = {}): ConfirmedTransaction {
  return {
    digest: '0xdigest',
    checkpoint: '1',
    status: { success: true, error: null },
    gasUsed: {
      computationCost: '1000',
      storageCost: '2000',
      storageRebate: '500',
      nonRefundableStorageFee: '10',
    },
    ...overrides,
  } as ConfirmedTransaction;
}

function operations(overrides: Partial<StreamOperations> = {}): StreamOperations {
  const reads = [stream(0n), stream(400_000000n)];
  return {
    read: vi.fn(async () => reads.shift() ?? stream(400_000000n)),
    prepare: vi.fn(async () => ({ bytes: new Uint8Array([1]), signature: 'sig' })),
    submit: vi.fn(async () => confirmed()),
    ...overrides,
  };
}

describe('createSuiStreamChain', () => {
  it('will not read a stream without a signer configured', async () => {
    const chain = createSuiStreamChain({ env: { SUI_NETWORK: 'testnet' } });
    await expect(chain.read(streamId)).rejects.toThrow('not configured');
  });

  it('reports the amount the chain actually moved', async () => {
    // Taken from the difference in `withdrawn`, not from the clock: a figure
    // derived here could name an amount the contract never paid.
    const chain = createSuiStreamChain({ env, operations: operations() });

    await expect(chain.withdraw(streamId)).resolves.toEqual({
      status: 'paid',
      digest: '0xdigest',
      amount: '400000000',
    });
  });

  it('withdraws against the mandate the stream names', async () => {
    const ops = operations();
    const chain = createSuiStreamChain({ env, operations: ops });

    await chain.withdraw(streamId);

    expect(vi.mocked(ops.prepare).mock.calls[0]![0]).toEqual({
      streamId,
      mandateId: `0x${'5'.repeat(64)}`,
    });
  });

  it('returns the abort code when nothing has accrued yet', async () => {
    const ops = operations({
      submit: vi.fn(async () =>
        confirmed({
          status: {
            success: false,
            error: { $kind: 'MoveAbort', MoveAbort: { abortCode: '28' } },
          },
        }),
      ),
    });
    const chain = createSuiStreamChain({ env, operations: ops });

    const result = await chain.withdraw(streamId);
    expect(result).toMatchObject({ status: 'refused', abortCode: 28 });
  });

  it('does not dress a non-abort failure up as a refusal', async () => {
    // Every code in the table already means something specific, so there is
    // none to spare for "it failed and we do not know why".
    const ops = operations({
      submit: vi.fn(async () =>
        confirmed({ status: { success: false, error: { $kind: 'InsufficientGas' } } }),
      ),
    });
    const chain = createSuiStreamChain({ env, operations: ops });

    await expect(chain.withdraw(streamId)).rejects.toThrow();
  });
});
