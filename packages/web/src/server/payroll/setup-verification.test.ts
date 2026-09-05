import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { CIRCLE_TESTNET_USDC_TYPE } from '@tali/treasury-sui';
import { convertMyrToUsdc } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { verifyPayrollSetupTransaction } from './setup-verification';

const employer = `0x${'a'.repeat(64)}`;
const employee = `0x${'b'.repeat(64)}`;
const packageId = `0x${'c'.repeat(64)}`;
const mandateId = `0x${'1'.repeat(64)}`;
const capId = `0x${'2'.repeat(64)}`;
const agent = Ed25519Keypair.generate();
const rate = { myrPerUsd: '4.0416', rateTimestampMs: 1_000, fetchedAtMs: 2_000 };
const expiryMs = 10_000_000;
const budget = convertMyrToUsdc('120000000', rate.myrPerUsd);
const wageCap = convertMyrToUsdc('6000000000', rate.myrPerUsd);
const env = {
  TALI_EMPLOYER_WALLET: employer,
  PAYROLL_PACKAGE_ID: packageId,
  AGENT_PRIVATE_KEY: agent.getSecretKey(),
  PAYROLL_EPF_ADDRESS: `0x${'d'.repeat(64)}`,
  PAYROLL_SOCSO_ADDRESS: `0x${'e'.repeat(64)}`,
  PAYROLL_EIS_ADDRESS: `0x${'f'.repeat(64)}`,
};

function client(capOwner = agent.toSuiAddress()) {
  const mandateType = `${packageId}::payroll::PayrollMandate<${CIRCLE_TESTNET_USDC_TYPE}>`;
  const capType = `${packageId}::payroll::PayrollCap`;
  return {
    waitForTransaction: vi.fn(async () => ({
      $kind: 'Transaction',
      Transaction: {
        digest: '4'.repeat(44),
        checkpoint: '123',
        status: { success: true, error: null },
        transaction: { sender: employer },
        objectTypes: { [mandateId]: mandateType, [capId]: capType },
        effects: {
          changedObjects: [mandateId, capId].map((objectId) => ({
            objectId,
            idOperation: 'Created',
          })),
        },
      },
    })),
    getObject: vi.fn(async ({ objectId }: { objectId: string }) => objectId === mandateId
      ? {
          object: {
            objectId: mandateId,
            type: mandateType,
            owner: { $kind: 'Shared', Shared: { initialSharedVersion: '1' } },
            json: {
              budget: { value: budget },
              employer,
              approved_employees: [employee],
              statutory_recipients: [env.PAYROLL_EPF_ADDRESS, env.PAYROLL_SOCSO_ADDRESS, env.PAYROLL_EIS_ADDRESS],
              statutory_min_bps: ['2300', '225', '40'],
              statutory_wage_cap: ['0', wageCap, wageCap],
              net_min_bps: '7000',
              max_per_run: budget,
              committed: '0',
              expiry_ms: String(expiryMs),
              revoked: false,
              total_paid: '0',
              run_count: '0',
            },
          },
        }
      : {
          object: {
            objectId: capId,
            type: capType,
            owner: { $kind: 'AddressOwner', AddressOwner: capOwner },
            json: { mandate_id: mandateId },
          },
        }),
  };
}

describe('payroll setup transaction verification', () => {
  it('accepts the finalized objects only when every configured rule matches', async () => {
    const verified = await verifyPayrollSetupTransaction({
      identity: employer,
      digest: '4'.repeat(44),
      env,
      client: client() as never,
      rates: async () => rate,
      now: () => 3_000,
    });

    expect(verified).toMatchObject({
      checkpoint: '123',
      mandateId,
      capId,
      employer,
      employee,
      capRecipient: agent.toSuiAddress(),
      budgetUsdc: budget,
    });
  });

  it('rejects a PayrollCap delivered to any other wallet', async () => {
    await expect(verifyPayrollSetupTransaction({
      identity: employer,
      digest: '4'.repeat(44),
      env,
      client: client(`0x${'9'.repeat(64)}`) as never,
      rates: async () => rate,
      now: () => 3_000,
    })).rejects.toMatchObject({ code: 'payroll_setup_verification_failed', status: 422 });
  });

  it('rejects verification by a wallet other than the configured employer', async () => {
    const chain = client();
    await expect(verifyPayrollSetupTransaction({
      identity: employee,
      digest: '4'.repeat(44),
      env,
      client: chain as never,
      rates: async () => rate,
    })).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    expect(chain.waitForTransaction).not.toHaveBeenCalled();
  });
});
