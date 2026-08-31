import {
  createTestnetClient,
  taliTestnetUsdcConfig,
} from '@tali/treasury-sui';
import { describe, expect, it, vi } from 'vitest';

import { createSuiMandateReader } from './mandate-reader';

const mandateId = `0x${'1'.repeat(64)}`;
const recipient = `0x${'a'.repeat(64)}`;
const fetchedAtMs = 1_788_156_000_000;

function fakeClient(getObject: ReturnType<typeof vi.fn>) {
  return { getObject } as unknown as Pick<
    ReturnType<typeof createTestnetClient>,
    'getObject'
  >;
}

describe('createSuiMandateReader', () => {
  it('maps the on-chain mandate into a JSON-safe policy snapshot', async () => {
    const getObject = vi.fn(async () => ({
      object: {
        objectId: mandateId,
        type: `${taliTestnetUsdcConfig.packageId}::treasury::Mandate<${taliTestnetUsdcConfig.coinType}>`,
        json: {
          initial_budget: '100000000',
          budget: { value: '80000000' },
          amount_spent: '20000000',
          max_per_claim: '5000000',
          expiry_ms: '1788623999000',
          revoked: false,
          approved_recipients: [recipient],
        },
      },
    }));
    const reader = createSuiMandateReader({
      client: fakeClient(getObject),
      config: taliTestnetUsdcConfig,
      now: () => fetchedAtMs,
    });

    await expect(reader.read(mandateId)).resolves.toEqual({
      id: mandateId,
      coinType: taliTestnetUsdcConfig.coinType,
      initialBudget: '100000000',
      remainingBudget: '80000000',
      amountSpent: '20000000',
      maxPerClaim: '5000000',
      expiryMs: 1_788_623_999_000,
      revoked: false,
      approvedRecipients: [recipient],
      fetchedAtMs,
    });
    expect(getObject).toHaveBeenCalledWith({
      objectId: mandateId,
      include: { json: true },
    });
  });

  it('preserves invalid Sui data as an adapter failure for the service to sanitize', async () => {
    const reader = createSuiMandateReader({
      client: fakeClient(
        vi.fn(async () => ({
          object: {
            objectId: mandateId,
            type: `${taliTestnetUsdcConfig.packageId}::treasury::Mandate<${taliTestnetUsdcConfig.coinType}>`,
            json: { revoked: 'not-a-boolean' },
          },
        })),
      ),
      config: taliTestnetUsdcConfig,
    });

    await expect(reader.read(mandateId)).rejects.toThrow(
      'Invalid approved recipient list returned by Sui',
    );
  });
});
