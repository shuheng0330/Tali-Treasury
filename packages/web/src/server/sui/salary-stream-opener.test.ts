import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { taliTestnetUsdcConfig, type SalaryStreamState } from '@tali/treasury-sui';
import { describe, expect, it, vi } from 'vitest';

import { createSuiSalaryStreamOpener, type SalaryStreamOpenOperations } from './salary-stream-opener';
import type { ConfirmedTransaction } from './transaction';

const keypair = Ed25519Keypair.generate();
const packageId = `0x${'6'.repeat(64)}`;
const mandateId = `0x${'5'.repeat(64)}`;
const capId = `0x${'4'.repeat(64)}`;
const employee = `0x${'7'.repeat(64)}`;
const streamId = `0x${'8'.repeat(64)}`;
const env = { AGENT_PRIVATE_KEY: keypair.getSecretKey(), SUI_NETWORK: 'testnet' };

const input = {
  packageId,
  payrollCapId: capId,
  mandateId,
  capOwnerWallet: keypair.toSuiAddress(),
  employee,
  totalAmount: '1000000',
  startedAtMs: 1_900_000_000_000,
  endsAtMs: 1_900_000_600_000,
};

function confirmed(): ConfirmedTransaction {
  return {
    digest: '9'.repeat(44),
    checkpoint: '1',
    status: { success: true, error: null },
    gasUsed: { computationCost: '1', storageCost: '1', storageRebate: '0', nonRefundableStorageFee: '0' },
  };
}

function state(overrides: Partial<SalaryStreamState> = {}): SalaryStreamState {
  return {
    id: streamId,
    coinType: taliTestnetUsdcConfig.coinType,
    mandateId,
    employee,
    totalAmount: 1_000_000n,
    startedAtMs: 1_900_000_000_000n,
    endsAtMs: 1_900_000_600_000n,
    withdrawn: 0n,
    ...overrides,
  };
}

function operations(overrides: Partial<SalaryStreamOpenOperations> = {}): SalaryStreamOpenOperations {
  return {
    prepare: vi.fn(async () => ({ bytes: new Uint8Array([1]), signature: 'sig' })),
    submit: vi.fn(async () => confirmed()),
    createdObjects: vi.fn(async () => [{
      objectId: streamId,
      type: `${packageId}::payroll::SalaryStream<${taliTestnetUsdcConfig.coinType}>`,
    }]),
    read: vi.fn(async () => state()),
    ...overrides,
  };
}

describe('Sui salary stream opener', () => {
  it('returns only a verified stream created by the confirmed transaction', async () => {
    const ops = operations();
    const opener = createSuiSalaryStreamOpener({ env, operations: ops });

    await expect(opener.open(input)).resolves.toEqual({
      status: 'opened',
      digest: '9'.repeat(44),
      streamId,
    });
    expect(ops.createdObjects).toHaveBeenCalledWith('9'.repeat(44));
    expect(ops.read).toHaveBeenCalledWith(streamId);
  });

  it('refuses to sign when the capability owner differs from the signer', async () => {
    const ops = operations();
    const opener = createSuiSalaryStreamOpener({ env, operations: ops });
    await expect(opener.open({ ...input, capOwnerWallet: `0x${'f'.repeat(64)}` }))
      .rejects.toMatchObject({ code: 'payment_configuration_failed', status: 503 });
    expect(ops.prepare).not.toHaveBeenCalled();
  });

  it('does not persist an unexpected or mismatched stream object', async () => {
    const opener = createSuiSalaryStreamOpener({
      env,
      operations: operations({ read: vi.fn(async () => state({ employee: `0x${'a'.repeat(64)}` })) }),
    });
    await expect(opener.open(input)).rejects.toMatchObject({
      code: 'payment_submission_uncertain',
      status: 502,
    });
  });
});
