import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, it, vi } from 'vitest';

import {
  PayrollSubmissionUncertainError,
  createSuiPayrollExecutor,
  type PayrollOperations,
} from './payroll-executor';
import type { ConfirmedTransaction } from './transaction';

const keypair = Ed25519Keypair.generate();
const env = {
  AGENT_PRIVATE_KEY: keypair.getSecretKey(),
  PAYROLL_CAP_ID: `0x${'4'.repeat(64)}`,
  PAYROLL_MANDATE_ID: `0x${'5'.repeat(64)}`,
  PAYROLL_PACKAGE_ID: `0x${'6'.repeat(64)}`,
  SUI_NETWORK: 'testnet',
};

const run = {
  employee: `0x${'7'.repeat(64)}`,
  gross: '3000000000',
  net: '2649000000',
  statutoryAmounts: ['720000000', '67500000', '12000000'],
};

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

function operations(overrides: Partial<PayrollOperations> = {}): PayrollOperations {
  return {
    prepare: vi.fn(async () => ({ bytes: new Uint8Array([1]), signature: 'sig' })),
    submit: vi.fn(async () => confirmed()),
    ...overrides,
  };
}

describe('createSuiPayrollExecutor', () => {
  it('refuses to sign anything until the module and its credentials are configured', () => {
    const executor = createSuiPayrollExecutor({ env: { SUI_NETWORK: 'testnet' } });
    expect(() => executor.assertReady()).toThrow(
      'Payroll runs need the published payroll module',
    );
  });

  it('refuses on any network but testnet', () => {
    const executor = createSuiPayrollExecutor({ env: { ...env, SUI_NETWORK: 'mainnet' } });
    expect(() => executor.assertReady()).toThrow();
  });

  it('passes the amounts through as base units in the order given', async () => {
    const ops = operations();
    const executor = createSuiPayrollExecutor({ env, operations: ops });

    await executor.run(run);

    const sent = vi.mocked(ops.prepare).mock.calls[0]![0];
    expect(sent.gross).toBe(3_000_000000n);
    expect(sent.net).toBe(2_649_000000n);
    expect(sent.statutoryAmounts).toEqual([720_000000n, 67_500000n, 12_000000n]);
    expect(sent.mandateId).toBe(`0x${'5'.repeat(64)}`);
  });

  it('reports a paid run with its digest', async () => {
    const executor = createSuiPayrollExecutor({ env, operations: operations() });
    await expect(executor.run(run)).resolves.toEqual({
      status: 'paid',
      digest: '0xdigest',
    });
  });

  it('reads the abort code out of a refusal', async () => {
    const ops = operations({
      submit: vi.fn(async () =>
        confirmed({
          status: {
            success: false,
            error: { $kind: 'MoveAbort', MoveAbort: { abortCode: '24' } },
          },
        }),
      ),
    });
    const executor = createSuiPayrollExecutor({ env, operations: ops });

    const result = await executor.run(run);
    expect(result).toMatchObject({ status: 'refused', abortCode: 24 });
    if (result.status === 'refused') {
      expect(result.message).toContain('Nobody was paid');
    }
  });

  it('records a run it could not even prepare, rather than leaving it pending', async () => {
    const ops = operations({
      prepare: vi.fn(async () => {
        throw new Error('the mandate object is gone');
      }),
    });
    const executor = createSuiPayrollExecutor({ env, operations: ops });

    const result = await executor.run(run);
    expect(result).toMatchObject({ status: 'refused', abortCode: null });
  });

  it('stops rather than guess when a submission outcome is unknown', async () => {
    // The wages may already be gone. Recording this as failed would invite a
    // retry, and a duplicated payroll run is worse than a stuck one.
    const ops = operations({
      submit: vi.fn(async () => {
        throw new Error('connection reset');
      }),
    });
    const executor = createSuiPayrollExecutor({ env, operations: ops });

    await expect(executor.run(run)).rejects.toBeInstanceOf(PayrollSubmissionUncertainError);
  });
});
