import { describe, expect, it } from 'vitest';
import { taliTestnetSuiConfig } from './config.js';
import {
  buildCreateMandateTransaction,
  buildRevokeTransaction,
  buildSpendTransaction,
  buildWithdrawTransaction,
} from './transactions.js';

const sender = '0x1';
const agent = '0x2';
const recipient = '0x3';
const mandateId = '0x4';
const capId = '0x5';

function moveCallNames(transaction: ReturnType<typeof buildSpendTransaction>): string[] {
  return transaction
    .getData()
    .commands.filter((command) => command.$kind === 'MoveCall')
    .map((command) => command.MoveCall.function);
}

describe('treasury transaction builders', () => {
  it('builds create_mandate and transfers the returned AdminCap to the treasurer', () => {
    const transaction = buildCreateMandateTransaction(taliTestnetSuiConfig, {
      sender,
      agent,
      budget: 500_000_000n,
      maxPerClaim: 100_000_000n,
      expiryMs: 4_102_444_800_000n,
      approvedRecipients: [recipient],
    });

    const commands = transaction.getData().commands;
    expect(commands.some((command) => command.$kind === 'MoveCall' && command.MoveCall.function === 'create_mandate')).toBe(true);
    expect(commands.some((command) => command.$kind === 'TransferObjects')).toBe(true);
  });

  it('builds a spend call with the Sui clock', () => {
    const transaction = buildSpendTransaction(taliTestnetSuiConfig, {
      agentCapId: capId,
      mandateId,
      recipient,
      amount: 50_000_000n,
    });

    expect(moveCallNames(transaction)).toEqual(['spend']);
    const moveCall = transaction.getData().commands[0];
    expect(moveCall?.$kind).toBe('MoveCall');
    if (moveCall?.$kind === 'MoveCall') {
      expect(moveCall.MoveCall.typeArguments).toEqual(['0x2::sui::SUI']);
      expect(moveCall.MoveCall.arguments).toHaveLength(5);
    }
  });

  it('builds treasurer revoke and withdrawal calls', () => {
    const revoke = buildRevokeTransaction(taliTestnetSuiConfig, {
      adminCapId: capId,
      mandateId,
    });
    const withdraw = buildWithdrawTransaction(taliTestnetSuiConfig, {
      adminCapId: capId,
      mandateId,
      recipient,
    });

    expect(moveCallNames(revoke)).toEqual(['revoke']);
    expect(moveCallNames(withdraw)).toEqual(['withdraw_remaining']);
  });

  it('rejects unsafe create-mandate inputs before wallet approval', () => {
    expect(() =>
      buildCreateMandateTransaction(taliTestnetSuiConfig, {
        sender,
        agent,
        budget: 10n,
        maxPerClaim: 11n,
        expiryMs: 4_102_444_800_000n,
        approvedRecipients: [recipient],
      }),
    ).toThrow('Maximum per claim cannot exceed the budget');

    expect(() =>
      buildCreateMandateTransaction(taliTestnetSuiConfig, {
        sender,
        agent,
        budget: 10n,
        maxPerClaim: 5n,
        expiryMs: 4_102_444_800_000n,
        approvedRecipients: [],
      }),
    ).toThrow('At least one approved recipient is required');
  });

  it('rejects a zero payment locally', () => {
    expect(() =>
      buildSpendTransaction(taliTestnetSuiConfig, {
        agentCapId: capId,
        mandateId,
        recipient,
        amount: 0n,
      }),
    ).toThrow('Payment amount must be greater than zero');
  });
});
