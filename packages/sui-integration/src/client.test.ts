import { describe, expect, it } from 'vitest';
import { taliTestnetSuiConfig } from './config.js';
import { readMandate } from './client.js';

describe('readMandate', () => {
  it('converts Sui JSON fields to application-safe bigint values', async () => {
    const client = {
      getObject: async () => ({
        object: {
          objectId: '0x4',
          version: '1',
          digest: 'digest',
          owner: { $kind: 'Shared', Shared: { initialSharedVersion: '1' } },
          type: `${taliTestnetSuiConfig.packageId}::treasury::Mandate<0x2::sui::SUI>`,
          content: undefined,
          previousTransaction: undefined,
          objectBcs: undefined,
          display: undefined,
          json: {
            initial_budget: '500000000',
            budget: '450000000',
            amount_spent: '50000000',
            max_per_claim: '100000000',
            expiry_ms: '4102444800000',
            revoked: false,
            approved_recipients: ['0x3'],
          },
        },
      }),
    };

    const mandate = await readMandate(client as never, taliTestnetSuiConfig, '0x4');
    expect(mandate).toMatchObject({
      remainingBudget: 450_000_000n,
      amountSpent: 50_000_000n,
      maxPerClaim: 100_000_000n,
      revoked: false,
    });
    expect(mandate.approvedRecipients[0]).toHaveLength(66);
  });

  it('rejects an object from a different package', async () => {
    const client = {
      getObject: async () => ({
        object: { objectId: '0x4', type: '0x9::treasury::Mandate<0x2::sui::SUI>' },
      }),
    };

    await expect(readMandate(client as never, taliTestnetSuiConfig, '0x4')).rejects.toThrow(
      'is not a mandate from the configured Tali package',
    );
  });
});
