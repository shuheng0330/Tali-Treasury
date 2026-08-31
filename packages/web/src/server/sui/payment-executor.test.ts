import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, it, vi } from 'vitest';

import {
  PaymentConfigurationError,
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
