import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, it, vi } from 'vitest';

import {
  PaymentConfigurationError,
  PaymentSubmissionUncertainError,
  createSuiPaymentExecutor,
  type PaymentOperations,
} from './payment-executor';

const testKeypair = Ed25519Keypair.generate();
const testEnv = {
  AGENT_PRIVATE_KEY: testKeypair.getSecretKey(),
  AGENT_CAP_ID: `0x${'3'.repeat(64)}`,
  SUI_NETWORK: 'testnet',
};

function createOperations(): PaymentOperations {
  return {
    prepare: vi.fn(),
    submit: vi.fn(),
    readBudget: vi.fn(),
  };
}

function createSuccessfulOperations(): PaymentOperations {
  return {
    prepare: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2]),
      signature: 'test-signature',
    })),
    submit: vi.fn(async () => ({
      digest: '7LhYxDemoDigest',
      checkpoint: '123',
      status: { success: true as const, error: null },
      gasUsed: {
        computationCost: '1000',
        storageCost: '400',
        storageRebate: '300',
        nonRefundableStorageFee: '100',
      },
    })),
    readBudget: vi.fn(async () => '15500000'),
  };
}

describe('createSuiPaymentExecutor readiness', () => {
  it('validates credentials lazily', () => {
    expect(() => createSuiPaymentExecutor({ env: {} })).not.toThrow();

    const executor = createSuiPaymentExecutor({ env: {} });
    expect(() => executor.assertReady()).toThrow(PaymentConfigurationError);
  });

  it('accepts a generated Ed25519 test key and canonical AgentCap', () => {
    const executor = createSuiPaymentExecutor({
      env: testEnv,
      operations: createOperations(),
    });

    expect(() => executor.assertReady()).not.toThrow();
  });

  it('rejects non-testnet configuration without echoing the key', () => {
    const executor = createSuiPaymentExecutor({
      env: { ...testEnv, SUI_NETWORK: 'mainnet' },
      operations: createOperations(),
    });

    let thrown: unknown;
    try {
      executor.assertReady();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PaymentConfigurationError);
    expect((thrown as Error).message).toContain('testnet');
    expect((thrown as Error).message).not.toContain(testEnv.AGENT_PRIVATE_KEY);
  });
});

describe('createSuiPaymentExecutor outcomes', () => {
  const input = {
    claimId: 'c1111111-1111-4111-8111-111111111111',
    mandateId: `0x${'4'.repeat(64)}`,
    recipient: `0x${'5'.repeat(64)}`,
    amount: '4500000',
    budgetBefore: '20000000',
  };

  it('maps a confirmed success and post-finality budget', async () => {
    const operations = createSuccessfulOperations();
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(1000);
    const executor = createSuiPaymentExecutor({ env: testEnv, operations, now });

    await expect(executor.execute(input)).resolves.toEqual({
      status: 'paid',
      payment: {
        ok: true,
        digest: '7LhYxDemoDigest',
        checkpoint: '123',
        gasUsed: '1200',
        finalityMs: 900,
        abortCode: null,
        abortKey: null,
        message: 'Payment confirmed on Sui testnet.',
        rawError: null,
        budgetBefore: '20000000',
        budgetAfter: '15500000',
      },
    });
    expect(operations.prepare).toHaveBeenCalledWith({
      agentCapId: testEnv.AGENT_CAP_ID,
      mandateId: input.mandateId,
      recipient: input.recipient,
      amount: 4500000n,
    });
    expect(operations.readBudget).toHaveBeenCalledWith(input.mandateId);
  });

  it('returns a sanitized confirmed Move rejection', async () => {
    const operations = createSuccessfulOperations();
    vi.mocked(operations.submit).mockResolvedValueOnce({
      digest: '7LhYxRejectedDigest',
      checkpoint: '124',
      status: {
        success: false,
        error: { $kind: 'MoveAbort', MoveAbort: { abortCode: '7' } },
      },
      gasUsed: {
        computationCost: '900',
        storageCost: '300',
        storageRebate: '200',
        nonRefundableStorageFee: '100',
      },
    });
    const executor = createSuiPaymentExecutor({ env: testEnv, operations });

    await expect(executor.execute(input)).resolves.toEqual({
      status: 'rejected',
      payment: expect.objectContaining({
        ok: false,
        digest: '7LhYxRejectedDigest',
        abortCode: 7,
        abortKey: 'RECIPIENT_NOT_APPROVED',
        message: 'This recipient is not approved by the mandate.',
        rawError: null,
        budgetBefore: '20000000',
        budgetAfter: '20000000',
      }),
    });
    expect(operations.readBudget).not.toHaveBeenCalled();
  });

  it('classifies submit transport errors as uncertain without exposing provider text', async () => {
    const operations = createSuccessfulOperations();
    vi.mocked(operations.submit).mockRejectedValueOnce(
      new Error('private RPC hostname'),
    );
    const executor = createSuiPaymentExecutor({ env: testEnv, operations });

    let thrown: unknown;
    try {
      await executor.execute(input);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PaymentSubmissionUncertainError);
    expect((thrown as Error).message).not.toContain('private RPC hostname');
    expect(operations.readBudget).not.toHaveBeenCalled();
  });

  it('returns a definite sanitized failure when preparation fails', async () => {
    const operations = createSuccessfulOperations();
    vi.mocked(operations.prepare).mockRejectedValueOnce(
      new Error('invalid transaction input'),
    );
    const executor = createSuiPaymentExecutor({ env: testEnv, operations });

    await expect(executor.execute(input)).resolves.toEqual({
      status: 'rejected',
      payment: {
        ok: false,
        digest: null,
        checkpoint: null,
        gasUsed: null,
        finalityMs: null,
        abortCode: null,
        abortKey: 'TRANSACTION_PREPARATION_FAILED',
        message: 'Payment could not be prepared for Sui testnet.',
        rawError: null,
        budgetBefore: '20000000',
        budgetAfter: '20000000',
      },
    });
    expect(operations.submit).not.toHaveBeenCalled();
  });
});
