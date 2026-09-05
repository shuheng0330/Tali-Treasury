import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { TransactionError } from '@mysten/sui/client';
import { CIRCLE_TESTNET_USDC_TYPE, type PayrollCapState, type PayrollMandateState } from '@tali/treasury-sui';
import { describe, expect, it, vi } from 'vitest';

import {
  createSuiPayrollRegistrationVerifier,
  isPendingTransactionLookupError,
  type PayrollRegistrationOperations,
  type PayrollRegistrationTransaction,
} from './payroll-registration-verifier';

const keypair = Ed25519Keypair.generate();
const packageId = `0x${'1'.repeat(64)}`;
const employer = `0x${'2'.repeat(64)}`;
const mandateId = `0x${'3'.repeat(64)}`;
const capId = `0x${'4'.repeat(64)}`;
const employee = `0x${'5'.repeat(64)}`;
const epf = `0x${'6'.repeat(64)}`;
const socso = `0x${'7'.repeat(64)}`;
const eis = `0x${'8'.repeat(64)}`;
const digest = '4'.repeat(44);
const capOwner = keypair.toSuiAddress();
const future = 4_102_444_800_000n;

const env = {
  SUI_NETWORK: 'testnet',
  PAYROLL_PACKAGE_ID: packageId,
  AGENT_PRIVATE_KEY: keypair.getSecretKey(),
  PAYROLL_EPF_ADDRESS: epf,
  PAYROLL_SOCSO_ADDRESS: socso,
  PAYROLL_EIS_ADDRESS: eis,
};

const transaction: PayrollRegistrationTransaction = {
  digest,
  checkpoint: '12',
  sender: employer,
  status: { success: true, error: null },
  createdObjects: [
    {
      objectId: mandateId,
      type: `${packageId}::payroll::PayrollMandate<${CIRCLE_TESTNET_USDC_TYPE}>`,
      version: '9',
    },
    { objectId: capId, type: `${packageId}::payroll::PayrollCap`, version: '9' },
  ],
};

const mandate: PayrollMandateState = {
  id: mandateId,
  coinType: CIRCLE_TESTNET_USDC_TYPE,
  employer,
  approvedEmployees: [employee],
  budget: 100_000_000000n,
  committed: 0n,
  spendable: 100_000_000000n,
  floors: [
    { recipient: epf, minBps: 2300n, wageCap: 0n },
    { recipient: socso, minBps: 225n, wageCap: 6_000_000000n },
    { recipient: eis, minBps: 40n, wageCap: 6_000_000000n },
  ],
  netMinBps: 7000n,
  maxPerRun: 10_000_000000n,
  expiryMs: future,
  revoked: false,
  totalPaid: 0n,
  runCount: 0n,
};

const cap: PayrollCapState = {
  id: capId,
  mandateId,
  owner: capOwner,
  previousTransaction: digest,
};

function operations(
  overrides: Partial<PayrollRegistrationOperations> = {},
): PayrollRegistrationOperations {
  return {
    lookup: vi.fn(async () => transaction),
    readMandate: vi.fn(async () => ({ state: mandate, previousTransaction: digest })),
    readCap: vi.fn(async () => cap),
    ...overrides,
  };
}

function verifier(overrides: Partial<PayrollRegistrationOperations> = {}, nowMs = 2_000_000_000_000) {
  return createSuiPayrollRegistrationVerifier({ env, operations: operations(overrides), now: () => nowMs });
}

describe('createSuiPayrollRegistrationVerifier', () => {
  it('classifies not-found and wait timeouts as pending, but not network failures', () => {
    expect(isPendingTransactionLookupError(new TransactionError('notFound', digest))).toBe(true);
    expect(isPendingTransactionLookupError(new DOMException('timed out', 'TimeoutError'))).toBe(true);
    expect(isPendingTransactionLookupError(new Error('connection reset'))).toBe(false);
  });

  it('returns an immutable snapshot for a finalized supported payroll', async () => {
    await expect(verifier().verify({ digest, employer })).resolves.toMatchObject({
      creationDigest: digest,
      packageId,
      coinType: CIRCLE_TESTNET_USDC_TYPE,
      mandateId,
      capId,
      employerWallet: employer,
      capOwnerWallet: capOwner,
      approvedEmployees: [employee],
      statutoryTerms: [
        { recipient: epf, minBps: '2300', wageCap: '0' },
        { recipient: socso, minBps: '225', wageCap: '6000000000' },
        { recipient: eis, minBps: '40', wageCap: '6000000000' },
      ],
      netMinBps: '7000',
      initialBudget: '100000000000',
    });
  });

  it('reads the object versions created by the setup transaction', async () => {
    const currentOperations = operations();
    const current = createSuiPayrollRegistrationVerifier({
      env,
      operations: currentOperations,
      now: () => 2_000_000_000_000,
    });

    await current.verify({ digest, employer });

    expect(currentOperations.readMandate).toHaveBeenCalledWith(mandateId, '9');
    expect(currentOperations.readCap).toHaveBeenCalledWith(capId, '9');
  });

  it('reports a transaction that is not found or checkpointed as pending', async () => {
    await expect(verifier({ lookup: vi.fn(async () => null) }).verify({ digest, employer }))
      .rejects.toMatchObject({ code: 'payroll_registration_pending', status: 409 });
    await expect(verifier({ lookup: vi.fn(async () => ({ ...transaction, checkpoint: null })) })
      .verify({ digest, employer })).rejects.toMatchObject({
        code: 'payroll_registration_pending', status: 409,
      });
  });

  it('refuses a failed transaction and a sender mismatch', async () => {
    await expect(verifier({ lookup: vi.fn(async () => ({
      ...transaction,
      status: { success: false as const, error: { private: 'abort details' } },
    })) }).verify({ digest, employer })).rejects.toMatchObject({
      code: 'payroll_registration_refused', status: 422,
    });
    await expect(verifier({ lookup: vi.fn(async () => ({
      ...transaction, sender: `0x${'9'.repeat(64)}`,
    })) }).verify({ digest, employer })).rejects.toMatchObject({
      code: 'payroll_registration_refused', status: 422,
    });
  });

  it('requires exactly one newly created configured mandate and cap', async () => {
    await expect(verifier({ lookup: vi.fn(async () => ({
      ...transaction,
      createdObjects: transaction.createdObjects.slice(0, 1),
    })) }).verify({ digest, employer })).rejects.toMatchObject({ status: 422 });
    await expect(verifier({ lookup: vi.fn(async () => ({
      ...transaction,
      createdObjects: [...transaction.createdObjects, transaction.createdObjects[0]!],
    })) }).verify({ digest, employer })).rejects.toMatchObject({ status: 422 });
    await expect(verifier({ lookup: vi.fn(async () => ({
      ...transaction,
      createdObjects: [
        { ...transaction.createdObjects[0]!, type: `${`0x${'f'.repeat(64)}`}::payroll::PayrollMandate<${CIRCLE_TESTNET_USDC_TYPE}>` },
        transaction.createdObjects[1]!,
      ],
    })) }).verify({ digest, employer })).rejects.toMatchObject({ status: 422 });
  });

  it('refuses a wrong coin type, cap link, cap owner or later object mutation', async () => {
    await expect(verifier({ readMandate: vi.fn(async () => ({
      state: { ...mandate, coinType: '0x2::sui::SUI' }, previousTransaction: digest,
    })) }).verify({ digest, employer })).rejects.toMatchObject({ status: 422 });
    await expect(verifier({ readCap: vi.fn(async () => ({ ...cap, mandateId: employee })) })
      .verify({ digest, employer })).rejects.toMatchObject({ status: 422 });
    await expect(verifier({ readCap: vi.fn(async () => ({ ...cap, owner: employee })) })
      .verify({ digest, employer })).rejects.toMatchObject({ status: 422 });
    await expect(verifier({ readMandate: vi.fn(async () => ({
      state: mandate, previousTransaction: '5'.repeat(44),
    })) }).verify({ digest, employer })).rejects.toMatchObject({ status: 422 });
  });

  it.each([
    { approvedEmployees: [] },
    { employer: employee },
    { committed: 1n, spendable: mandate.budget - 1n },
    { totalPaid: 1n },
    { runCount: 1n },
    { revoked: true },
    { netMinBps: 6999n },
    { budget: 0n, spendable: 0n },
    { maxPerRun: 0n },
    { expiryMs: 1_999_999_999_999n },
    { floors: mandate.floors.slice(0, 2) },
    { floors: mandate.floors.map((floor, index) => index === 0 ? { ...floor, minBps: 2299n } : floor) },
    { floors: mandate.floors.map((floor, index) => index === 0 ? { ...floor, wageCap: 1n } : floor) },
    { floors: mandate.floors.map((floor, index) => index === 2 ? { ...floor, wageCap: 1n } : floor) },
    { floors: mandate.floors.map((floor, index) => index === 2 ? { ...floor, recipient: socso } : floor) },
  ])('refuses unsupported or non-pristine mandate fields %#', async (change) => {
    await expect(verifier({ readMandate: vi.fn(async () => ({
      state: { ...mandate, ...change }, previousTransaction: digest,
    })) }).verify({ digest, employer })).rejects.toMatchObject({
      code: 'payroll_registration_refused', status: 422,
    });
  });

  it('fails closed when verification configuration is missing or not Testnet', async () => {
    for (const invalid of [{ ...env, AGENT_PRIVATE_KEY: '' }, { ...env, SUI_NETWORK: 'mainnet' }]) {
      const current = createSuiPayrollRegistrationVerifier({ env: invalid, operations: operations() });
      await expect(current.verify({ digest, employer })).rejects.toMatchObject({
        code: 'payroll_registration_configuration_failed', status: 503,
      });
    }
  });

  it('sanitizes RPC failures', async () => {
    const current = verifier({ lookup: vi.fn(async () => { throw new Error('private RPC host'); }) });
    const error = await current.verify({ digest, employer }).catch((value) => value);
    expect(error).toMatchObject({ code: 'payroll_registration_failed', status: 502 });
    expect((error as Error).message).not.toContain('private RPC host');
  });
});
