import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { describe, expect, it, vi } from 'vitest';

import { createPayrollSetupPreview } from './setup';

const employer = `0x${'a'.repeat(64)}`;
const employee = `0x${'b'.repeat(64)}`;
const agent = Ed25519Keypair.generate();
const env = {
  TALI_EMPLOYER_WALLET: employer,
  PAYROLL_PACKAGE_ID: `0x${'c'.repeat(64)}`,
  AGENT_PRIVATE_KEY: agent.getSecretKey(),
  PAYROLL_EPF_ADDRESS: `0x${'d'.repeat(64)}`,
  PAYROLL_SOCSO_ADDRESS: `0x${'e'.repeat(64)}`,
  PAYROLL_EIS_ADDRESS: `0x${'f'.repeat(64)}`,
};
const rate = { myrPerUsd: '4.0416', rateTimestampMs: 1_000, fetchedAtMs: 2_000 };

describe('authenticated payroll setup preview', () => {
  it('converts the RM120 ceiling and assigns the cap to the backend agent', async () => {
    const preview = await createPayrollSetupPreview({
      identity: employer,
      employee,
      expiryMs: 10_000_000,
      env,
      rates: async () => rate,
      now: () => 3_000,
    });

    expect(preview.wageMyr).toBe('30000000');
    expect(preview.budgetMyr).toBe('120000000');
    expect(preview.budgetUsdc).toBe('29691211');
    expect(preview.maxPerRunUsdc).toBe(preview.budgetUsdc);
    expect(preview.capRecipient).toBe(agent.toSuiAddress());
    expect(preview.floors.map((floor) => floor.minBps)).toEqual(['2300', '225', '40']);
  });

  it('rejects another authenticated wallet before reading the FX provider', async () => {
    const rates = vi.fn(async () => rate);
    await expect(createPayrollSetupPreview({
      identity: employee,
      employee,
      expiryMs: 10_000_000,
      env,
      rates,
      now: () => 3_000,
    })).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    expect(rates).not.toHaveBeenCalled();
  });

  it('rejects an expiry too close to execution', async () => {
    await expect(createPayrollSetupPreview({
      identity: employer,
      employee,
      expiryMs: 3_000 + 60 * 60_000,
      env,
      rates: async () => rate,
      now: () => 3_000,
    })).rejects.toMatchObject({ status: 400 });
  });
});
