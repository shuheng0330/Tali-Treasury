import { CIRCLE_TESTNET_USDC_TYPE } from '@tali/treasury-sui';
import { describe, expect, it, vi } from 'vitest';

import { createSuiEventRegistrationVerifier } from './event-registration-verifier';

const packageId = `0x${'9'.repeat(64)}`;
const treasurer = `0x${'a'.repeat(64)}`;
const agent = `0x${'c'.repeat(64)}`;
const mandateId = `0x${'b'.repeat(64)}`;
const adminCapId = `0x${'d'.repeat(64)}`;
const agentCapId = `0x${'e'.repeat(64)}`;
const recipient = `0x${'f'.repeat(64)}`;
const digest = '4'.repeat(44);
const now = 1_800_000_000_000;
const expiry = now + 86_400_000;

function client() {
  const types = {
    [mandateId]: `${packageId}::treasury::Mandate<${CIRCLE_TESTNET_USDC_TYPE}>`,
    [adminCapId]: `${packageId}::treasury::AdminCap`,
    [agentCapId]: `${packageId}::treasury::AgentCap`,
  };
  const objects: Record<string, unknown> = {
    [mandateId]: {
      objectId: mandateId,
      type: types[mandateId],
      json: {
        initial_budget: '10000000',
        budget: { value: '10000000' },
        amount_spent: '0',
        max_per_claim: '5000000',
        expiry_ms: String(expiry),
        revoked: false,
        approved_recipients: [recipient],
      },
    },
    [adminCapId]: {
      objectId: adminCapId,
      type: types[adminCapId],
      owner: { $kind: 'AddressOwner', AddressOwner: treasurer },
      json: { mandate_id: mandateId },
    },
    [agentCapId]: {
      objectId: agentCapId,
      type: types[agentCapId],
      owner: { $kind: 'AddressOwner', AddressOwner: agent },
      json: { mandate_id: mandateId },
    },
  };
  return {
    waitForTransaction: vi.fn(async () => ({
      $kind: 'Transaction',
      Transaction: {
        digest,
        checkpoint: '123',
        transaction: { sender: treasurer },
        status: { success: true, error: null },
        effects: {
          changedObjects: [mandateId, adminCapId, agentCapId].map((objectId) => ({
            objectId,
            idOperation: 'Created',
          })),
        },
        objectTypes: types,
      },
    })),
    getObject: vi.fn(async ({ objectId }: { objectId: string }) => ({
      object: objects[objectId],
    })),
  };
}

const env = {
  SUI_NETWORK: 'testnet',
  TALI_PACKAGE_ID: packageId,
  TALI_COIN_TYPE: CIRCLE_TESTNET_USDC_TYPE,
  NEXT_PUBLIC_AGENT_ADDRESS: agent,
};

describe('createSuiEventRegistrationVerifier', () => {
  it('accepts the finalized funded mandate and both capability owners', async () => {
    const verifier = createSuiEventRegistrationVerifier({
      env,
      client: client() as never,
      now: () => now,
    });

    await expect(verifier.verify({ digest, treasurer })).resolves.toEqual({
      digest,
      mandateId,
      packageId,
      coinType: CIRCLE_TESTNET_USDC_TYPE,
      treasurerWallet: treasurer,
      agentWallet: agent,
      approvedRecipients: [recipient],
      initialBudget: '10000000',
      maxPerClaim: '5000000',
      expiryMs: expiry,
    });
  });

  it('rejects a transaction signed by another wallet', async () => {
    const current = client();
    current.waitForTransaction.mockResolvedValueOnce({
      $kind: 'Transaction',
      Transaction: {
        digest,
        checkpoint: '123',
        transaction: { sender: agent },
        status: { success: true, error: null },
        effects: { changedObjects: [] },
        objectTypes: {},
      },
    } as never);
    const verifier = createSuiEventRegistrationVerifier({ env, client: current as never, now: () => now });

    await expect(verifier.verify({ digest, treasurer })).rejects.toMatchObject({
      code: 'event_registration_refused',
      status: 422,
    });
  });

  it('rejects an AgentCap owned by an unexpected signer', async () => {
    const current = client();
    current.getObject.mockImplementation(async ({ objectId }: { objectId: string }) => {
      const response = await client().getObject({ objectId });
      if (objectId === agentCapId) {
        return {
          object: {
            ...(response as { object: Record<string, unknown> }).object,
            owner: { $kind: 'AddressOwner', AddressOwner: treasurer },
          },
        };
      }
      return response;
    });
    const verifier = createSuiEventRegistrationVerifier({ env, client: current as never, now: () => now });

    await expect(verifier.verify({ digest, treasurer })).rejects.toMatchObject({
      code: 'event_registration_refused',
      status: 422,
    });
  });
});
