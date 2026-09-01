import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Transaction } from '@mysten/sui/transactions';
import { taliTestnetSuiConfig } from './config.js';
import {
  buildCreatePayrollMandateTransaction,
  buildOpenStreamTransaction,
  buildRevokePayrollTransaction,
  buildRunPayrollTransaction,
  buildWithdrawEarnedTransaction,
  buildWithdrawPayrollRemainingTransaction,
} from './payroll.js';

/**
 * The Move module and these builders are edited by different people. An added
 * or reordered parameter would still encode, still submit, and only show up as
 * money going somewhere unintended, so the argument lists are read out of the
 * contract source and compared rather than kept in step by hand.
 */

const SOURCE_PATH = fileURLToPath(
  new URL('../../../contracts/tali_treasury/sources/payroll.move', import.meta.url),
);

/** Supplied by the runtime, never by the caller. */
const IMPLICIT_PARAMETERS = new Set(['ctx']);

function splitParameters(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of list) {
    if (character === '<' || character === '(') depth += 1;
    if (character === '>' || character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);

  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function readSignatures(): Map<string, string[]> {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const signatures = new Map<string, string[]>();
  const declaration = /public fun (\w+)(?:<[^>]*>)?\(([\s\S]*?)\)\s*(?::[^{]*?)?\{/g;

  for (const match of source.matchAll(declaration)) {
    const [, name, parameters] = match;
    if (!name || parameters === undefined) continue;
    signatures.set(
      name,
      splitParameters(parameters)
        .map((parameter) => parameter.split(':')[0]?.trim() ?? '')
        .filter((parameter) => !IMPLICIT_PARAMETERS.has(parameter)),
    );
  }

  return signatures;
}

const EXPECTED: Record<string, string[]> = {
  create_payroll_mandate: [
    'coin',
    'approved_employees',
    'statutory_recipients',
    'statutory_min_bps',
    'statutory_wage_cap',
    'net_min_bps',
    'max_per_run',
    'expiry_ms',
  ],
  run_payroll: [
    'cap',
    'mandate',
    'employee',
    'gross',
    'net',
    'statutory_amounts',
    'clock',
  ],
  open_stream: [
    'cap',
    'mandate',
    'employee',
    'total_amount',
    'started_at_ms',
    'ends_at_ms',
  ],
  withdraw_earned: ['stream', 'mandate', 'clock'],
  revoke_payroll: ['cap', 'mandate'],
  withdraw_payroll_remaining: ['cap', 'mandate'],
};

function argumentCount(transaction: Transaction, functionName: string): number {
  const command = transaction
    .getData()
    .commands.find(
      (entry) => entry.$kind === 'MoveCall' && entry.MoveCall.function === functionName,
    );
  if (command?.$kind !== 'MoveCall') throw new Error(`No ${functionName} call was built`);
  return command.MoveCall.arguments.length;
}

const nextYear = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000);

const transactions: Record<string, Transaction> = {
  create_payroll_mandate: buildCreatePayrollMandateTransaction(taliTestnetSuiConfig, {
    sender: '0x1',
    capRecipient: '0x2',
    approvedEmployees: ['0x3'],
    budget: 100_000_000000n,
    floors: [{ recipient: '0xe9f', minBps: 2300n, wageCap: 0n }],
    netMinBps: 7000n,
    maxPerRun: 10_000_000000n,
    expiryMs: nextYear,
  }),
  run_payroll: buildRunPayrollTransaction(taliTestnetSuiConfig, {
    payrollCapId: '0x5',
    mandateId: '0x4',
    employee: '0x3',
    gross: 3_000_000000n,
    net: 2_649_000000n,
    statutoryAmounts: [720_000000n],
  }),
  open_stream: buildOpenStreamTransaction(taliTestnetSuiConfig, {
    payrollCapId: '0x5',
    mandateId: '0x4',
    employee: '0x3',
    totalAmount: 3_000_000000n,
    startedAtMs: 1_000n,
    endsAtMs: 2_000n,
  }),
  withdraw_earned: buildWithdrawEarnedTransaction(taliTestnetSuiConfig, {
    streamId: '0x6',
    mandateId: '0x4',
  }),
  revoke_payroll: buildRevokePayrollTransaction(taliTestnetSuiConfig, {
    payrollCapId: '0x5',
    mandateId: '0x4',
  }),
  withdraw_payroll_remaining: buildWithdrawPayrollRemainingTransaction(
    taliTestnetSuiConfig,
    { payrollCapId: '0x5', mandateId: '0x4' },
  ),
};

describe('payroll builders against the Move source', () => {
  const signatures = readSignatures();

  it('finds the module the builders target', () => {
    expect(signatures.size).toBeGreaterThan(0);
  });

  for (const [name, parameters] of Object.entries(EXPECTED)) {
    it(`${name} still takes the parameters the builder sends`, () => {
      expect(signatures.get(name)).toEqual(parameters);
      expect(argumentCount(transactions[name]!, name)).toBe(parameters.length);
    });
  }
});
