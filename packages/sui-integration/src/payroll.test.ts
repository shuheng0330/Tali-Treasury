import { describe, expect, it } from 'vitest';
import { bcs } from '@mysten/sui/bcs';
import type { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import { taliTestnetSuiConfig } from './config.js';
import {
  buildCreatePayrollMandateTransaction,
  buildOpenStreamTransaction,
  buildRevokePayrollTransaction,
  buildRunPayrollTransaction,
  buildWithdrawEarnedTransaction,
  readPayrollCap,
  readPayrollMandate,
  readSalaryStream,
} from './payroll.js';

const sender = '0x1';
const capRecipient = '0x2';
const employee = '0x3';
const mandateId = '0x4';
const capId = '0x5';
const streamId = '0x6';

const epf = '0xe9f';
const socso = '0x50c50';
const eis = '0xe15';

const floors = [
  { recipient: epf, minBps: 2300n, wageCap: 0n },
  { recipient: socso, minBps: 225n, wageCap: 6_000_000000n },
  { recipient: eis, minBps: 40n, wageCap: 6_000_000000n },
];

const nextYear = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000);

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    sender,
    capRecipient,
    approvedEmployees: [employee],
    budget: 100_000_000000n,
    floors,
    netMinBps: 7000n,
    maxPerRun: 10_000_000000n,
    expiryMs: nextYear,
    ...overrides,
  } as Parameters<typeof buildCreatePayrollMandateTransaction>[1];
}

function moveCallNames(transaction: Transaction): string[] {
  return transaction
    .getData()
    .commands.filter((command) => command.$kind === 'MoveCall')
    .map((command) => command.MoveCall.function);
}

function pureBytes(transaction: Transaction, index: number): Uint8Array {
  const input = transaction.getData().inputs[index];
  if (input?.$kind !== 'Pure') throw new Error(`Input ${index} is not a pure value`);
  return fromBase64(input.Pure.bytes);
}

function addressVector(transaction: Transaction, index: number): string[] {
  return bcs.vector(bcs.Address).parse(pureBytes(transaction, index));
}

function u64Vector(transaction: Transaction, index: number): bigint[] {
  return bcs
    .vector(bcs.u64())
    .parse(pureBytes(transaction, index))
    .map((value) => BigInt(value));
}

describe('buildCreatePayrollMandateTransaction', () => {
  it('creates the mandate and hands the PayrollCap to the named holder', () => {
    const transaction = buildCreatePayrollMandateTransaction(
      taliTestnetSuiConfig,
      createInput(),
    );

    expect(moveCallNames(transaction)).toEqual(['create_payroll_mandate']);
    expect(
      transaction.getData().commands.some((command) => command.$kind === 'TransferObjects'),
    ).toBe(true);
  });

  it('keeps the three statutory vectors in the order the floors were given', () => {
    // The contract pairs statutory_recipients[i] with statutory_min_bps[i] and
    // statutory_wage_cap[i]. A reordering here would pay SOCSO money to EPF and
    // measure it against the wrong ceiling, with every assert still passing, so
    // this reads the encoded arguments rather than trusting the call shape.
    const transaction = buildCreatePayrollMandateTransaction(
      taliTestnetSuiConfig,
      createInput(),
    );

    expect(addressVector(transaction, 0).map((a) => BigInt(a))).toEqual([BigInt(employee)]);

    const recipients = addressVector(transaction, 1);
    expect(recipients).toHaveLength(3);
    expect(recipients.map((address) => BigInt(address))).toEqual([
      BigInt(epf),
      BigInt(socso),
      BigInt(eis),
    ]);
    expect(u64Vector(transaction, 2)).toEqual([2300n, 225n, 40n]);
    expect(u64Vector(transaction, 3)).toEqual([0n, 6_000_000000n, 6_000_000000n]);
  });

  it('refuses a floor of zero basis points', () => {
    // Zero reads as enforcement and accepts one base unit. The contract cannot
    // tell that apart from a real floor, so it has to be caught here.
    expect(() =>
      buildCreatePayrollMandateTransaction(
        taliTestnetSuiConfig,
        createInput({
          floors: [{ recipient: epf, minBps: 0n, wageCap: 0n }, ...floors.slice(1)],
        }),
      ),
    ).toThrow('Statutory minimum for recipient 1 must be greater than zero');
  });

  it('refuses a mandate with no statutory floors at all', () => {
    expect(() =>
      buildCreatePayrollMandateTransaction(taliTestnetSuiConfig, createInput({ floors: [] })),
    ).toThrow('At least one statutory floor is required');
  });

  it('refuses two floors pointing at the same body', () => {
    expect(() =>
      buildCreatePayrollMandateTransaction(
        taliTestnetSuiConfig,
        createInput({ floors: [floors[0], { ...floors[1], recipient: epf }] }),
      ),
    ).toThrow('must not contain duplicates');
  });

  it('refuses a run limit larger than the budget, and an expiry in the past', () => {
    expect(() =>
      buildCreatePayrollMandateTransaction(
        taliTestnetSuiConfig,
        createInput({ maxPerRun: 200_000_000000n }),
      ),
    ).toThrow('cannot exceed the budget');

    expect(() =>
      buildCreatePayrollMandateTransaction(
        taliTestnetSuiConfig,
        createInput({ expiryMs: BigInt(Date.now() - 1000) }),
      ),
    ).toThrow('Expiry must be in the future');
  });
});

describe('buildRunPayrollTransaction', () => {
  const run = {
    payrollCapId: capId,
    mandateId,
    employee,
    gross: 3_000_000000n,
    net: 2_649_000000n,
    statutoryAmounts: [720_000000n, 67_500000n, 12_000000n],
  };

  it('sends the wage, the three contributions and the clock in one call', () => {
    const transaction = buildRunPayrollTransaction(taliTestnetSuiConfig, run);

    expect(moveCallNames(transaction)).toEqual(['run_payroll']);
    const command = transaction.getData().commands[0];
    expect(command?.$kind).toBe('MoveCall');
    if (command?.$kind === 'MoveCall') {
      expect(command.MoveCall.arguments).toHaveLength(7);
      expect(command.MoveCall.typeArguments).toEqual(['0x2::sui::SUI']);
    }
  });

  it('passes gross, net and the contributions in the order the module declares', () => {
    // run_payroll(cap, mandate, employee, gross, net, statutory_amounts, clock).
    // Gross and net are adjacent u64s, so swapping them would still encode and
    // still run, paying the worker the gross and calling it net.
    const transaction = buildRunPayrollTransaction(taliTestnetSuiConfig, run);

    expect(BigInt(bcs.Address.parse(pureBytes(transaction, 2)))).toBe(BigInt(employee));
    expect(BigInt(bcs.u64().parse(pureBytes(transaction, 3)))).toBe(3_000_000000n);
    expect(BigInt(bcs.u64().parse(pureBytes(transaction, 4)))).toBe(2_649_000000n);
    expect(u64Vector(transaction, 5)).toEqual([720_000000n, 67_500000n, 12_000000n]);
  });

  it('still builds a run that underpays EPF', () => {
    // The safety demo submits one base unit of EPF and lets the chain refuse it
    // on abort 24. Validating the floors here would hide the guarantee.
    const transaction = buildRunPayrollTransaction(taliTestnetSuiConfig, {
      ...run,
      statutoryAmounts: [1n, 67_500000n, 12_000000n],
    });

    expect(moveCallNames(transaction)).toEqual(['run_payroll']);
  });

  it('refuses a contribution of zero, which the contract would reject anyway', () => {
    expect(() =>
      buildRunPayrollTransaction(taliTestnetSuiConfig, {
        ...run,
        statutoryAmounts: [720_000000n, 0n, 12_000000n],
      }),
    ).toThrow('Statutory amount 2 must be greater than zero');
  });

  it('refuses a run with no gross to measure the floors against', () => {
    expect(() =>
      buildRunPayrollTransaction(taliTestnetSuiConfig, { ...run, gross: 0n }),
    ).toThrow('Gross pay must be greater than zero');
  });
});

describe('stream transactions', () => {
  it('opens a stream and refuses a period that ends before it starts', () => {
    const transaction = buildOpenStreamTransaction(taliTestnetSuiConfig, {
      payrollCapId: capId,
      mandateId,
      employee,
      totalAmount: 3_000_000000n,
      startedAtMs: 1_000n,
      endsAtMs: 2_000n,
    });
    expect(moveCallNames(transaction)).toEqual(['open_stream']);

    expect(() =>
      buildOpenStreamTransaction(taliTestnetSuiConfig, {
        payrollCapId: capId,
        mandateId,
        employee,
        totalAmount: 3_000_000000n,
        startedAtMs: 2_000n,
        endsAtMs: 2_000n,
      }),
    ).toThrow('A stream must end after it starts');
  });

  it('withdraws without a capability or a recipient', () => {
    // Nobody can redirect a withdrawal, so nothing needs authorizing: the
    // contract always pays the stream's own employee.
    const transaction = buildWithdrawEarnedTransaction(taliTestnetSuiConfig, {
      streamId,
      mandateId,
    });

    expect(moveCallNames(transaction)).toEqual(['withdraw_earned']);
    const command = transaction.getData().commands[0];
    if (command?.$kind === 'MoveCall') {
      expect(command.MoveCall.arguments).toHaveLength(3);
    }
  });

  it('builds a revocation', () => {
    const transaction = buildRevokePayrollTransaction(taliTestnetSuiConfig, {
      payrollCapId: capId,
      mandateId,
    });
    expect(moveCallNames(transaction)).toEqual(['revoke_payroll']);
  });
});

function objectClient(
  type: string,
  json: unknown,
  metadata: Record<string, unknown> = {},
) {
  return {
    getObject: async () => ({
      object: { objectId: '0x4', type, json, ...metadata },
    }),
  } as never;
}

const mandateJson = {
  budget: '100000000000',
  employer: '0x1',
  approved_employees: [employee],
  statutory_recipients: [epf, socso, eis],
  statutory_min_bps: ['2300', '225', '40'],
  statutory_wage_cap: ['0', '6000000000', '6000000000'],
  net_min_bps: '7000',
  max_per_run: '10000000000',
  committed: '3000000000',
  expiry_ms: '4102444800000',
  revoked: false,
  total_paid: '5000000000',
  run_count: '2',
};

describe('readPayrollMandate', () => {
  const type = `${taliTestnetSuiConfig.packageId}::payroll::PayrollMandate<0x2::sui::SUI>`;

  it('zips the three vectors back into floors and subtracts what streams reserved', async () => {
    const mandate = await readPayrollMandate(
      objectClient(type, mandateJson),
      taliTestnetSuiConfig,
      '0x4',
    );

    expect(mandate.floors).toHaveLength(3);
    expect(mandate.floors[1]).toMatchObject({ minBps: 225n, wageCap: 6_000_000000n });
    expect(BigInt(mandate.floors[1]!.recipient)).toBe(BigInt(socso));
    expect(mandate.budget).toBe(100_000_000000n);
    expect(mandate.committed).toBe(3_000_000000n);
    expect(mandate.spendable).toBe(97_000_000000n);
    expect(mandate.runCount).toBe(2n);
  });

  it('refuses to zip vectors of different lengths', async () => {
    const client = objectClient(type, {
      ...mandateJson,
      statutory_wage_cap: ['0', '6000000000'],
    });

    await expect(readPayrollMandate(client, taliTestnetSuiConfig, '0x4')).rejects.toThrow(
      'different lengths',
    );
  });

  it('refuses an object from a different package', async () => {
    const client = objectClient('0x9::payroll::PayrollMandate<0x2::sui::SUI>', mandateJson);

    await expect(readPayrollMandate(client, taliTestnetSuiConfig, '0x4')).rejects.toThrow(
      'is not a payroll mandate from the configured Tali package',
    );
  });

  it('refuses a claims mandate handed to it by mistake', async () => {
    const client = objectClient(
      `${taliTestnetSuiConfig.packageId}::treasury::Mandate<0x2::sui::SUI>`,
      mandateJson,
    );

    await expect(readPayrollMandate(client, taliTestnetSuiConfig, '0x4')).rejects.toThrow(
      'is not a payroll mandate',
    );
  });
});

describe('readPayrollCap', () => {
  const type = `${taliTestnetSuiConfig.packageId}::payroll::PayrollCap`;

  it('reads the linked mandate, address owner and creating transaction', async () => {
    const cap = await readPayrollCap(
      objectClient(type, { mandate_id: mandateId }, {
        objectId: capId,
        owner: { $kind: 'AddressOwner', AddressOwner: capRecipient },
        previousTransaction: '4'.repeat(44),
      }),
      taliTestnetSuiConfig,
      capId,
    );

    expect(cap).toEqual({
      id: `0x${'0'.repeat(63)}5`,
      mandateId: `0x${'0'.repeat(63)}4`,
      owner: `0x${'0'.repeat(63)}2`,
      previousTransaction: '4'.repeat(44),
    });
  });

  it('refuses a non-address-owned cap', async () => {
    await expect(
      readPayrollCap(
        objectClient(type, { mandate_id: mandateId }, {
          objectId: capId,
          owner: { $kind: 'Shared', Shared: { initialSharedVersion: '1' } },
          previousTransaction: '4'.repeat(44),
        }),
        taliTestnetSuiConfig,
        capId,
      ),
    ).rejects.toThrow('address-owned');
  });

  it('refuses a cap from another package', async () => {
    await expect(
      readPayrollCap(
        objectClient('0x9::payroll::PayrollCap', { mandate_id: mandateId }, {
          objectId: capId,
          owner: { $kind: 'AddressOwner', AddressOwner: capRecipient },
          previousTransaction: '4'.repeat(44),
        }),
        taliTestnetSuiConfig,
        capId,
      ),
    ).rejects.toThrow('configured Tali package');
  });
});

describe('readSalaryStream', () => {
  const type = `${taliTestnetSuiConfig.packageId}::payroll::SalaryStream<0x2::sui::SUI>`;

  it('reads the period and what has already been drawn', async () => {
    const stream = await readSalaryStream(
      objectClient(type, {
        mandate_id: mandateId,
        employee,
        total_amount: '3000000000',
        started_at_ms: '1000',
        ends_at_ms: '2000',
        withdrawn: '400000000',
      }),
      taliTestnetSuiConfig,
      '0x6',
    );

    expect(stream.totalAmount).toBe(3_000_000000n);
    expect(stream.withdrawn).toBe(400_000000n);
    expect(stream.endsAtMs).toBe(2000n);
    expect(stream.employee).toHaveLength(66);
  });

  it('rejects a mandate passed where a stream was expected', async () => {
    const client = objectClient(
      `${taliTestnetSuiConfig.packageId}::payroll::PayrollMandate<0x2::sui::SUI>`,
      mandateJson,
    );

    await expect(readSalaryStream(client, taliTestnetSuiConfig, '0x6')).rejects.toThrow(
      'is not a salary stream',
    );
  });
});
