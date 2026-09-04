import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeAddress, normalizeConfig } from './config.js';
import {
  asBigInt,
  asBigIntVector,
  asBoolean,
  asRecord,
  asStringVector,
  balanceValue,
} from './parse.js';
import type { TreasuryConfig } from './types.js';

const BPS_DENOMINATOR = 10_000n;

/**
 * One statutory body's enforcement terms.
 *
 * The contract holds these as three parallel vectors and pairs them by index.
 * A divergence between those vectors would send money to the wrong body while
 * every assert still passed, so this package keeps them as one list of triples
 * and splits them only at the call boundary.
 */
export interface StatutoryFloor {
  recipient: string;
  /** Minimum share of the basis this body must receive, in basis points. */
  minBps: bigint;
  /** Wage ceiling the floor is measured against. Zero means no ceiling. */
  wageCap: bigint;
}

export interface CreatePayrollMandateInput {
  sender: string;
  /** The only addresses this mandate may ever pay a wage to. */
  approvedEmployees: string[];
  /**
   * Receives the PayrollCap. Payroll has a single capability, unlike the claims
   * treasury: whoever holds it can both run payroll and revoke the mandate.
   */
  capRecipient: string;
  budget: bigint;
  floors: StatutoryFloor[];
  /** Minimum share of gross the worker must receive, in basis points. */
  netMinBps: bigint;
  maxPerRun: bigint;
  expiryMs: bigint;
}

export interface RunPayrollInput {
  payrollCapId: string;
  mandateId: string;
  employee: string;
  gross: bigint;
  net: bigint;
  /** One amount per floor, in the order the mandate was created with. */
  statutoryAmounts: bigint[];
}

export interface OpenStreamInput {
  payrollCapId: string;
  mandateId: string;
  employee: string;
  totalAmount: bigint;
  startedAtMs: bigint;
  endsAtMs: bigint;
}

export interface WithdrawEarnedInput {
  streamId: string;
  mandateId: string;
}

export interface RevokePayrollInput {
  payrollCapId: string;
  mandateId: string;
}

export interface PayrollMandateState {
  id: string;
  coinType: string;
  employer: string;
  approvedEmployees: string[];
  budget: bigint;
  /** Reserved by open streams, and not spendable by a run. */
  committed: bigint;
  /** budget minus committed. */
  spendable: bigint;
  floors: StatutoryFloor[];
  netMinBps: bigint;
  maxPerRun: bigint;
  expiryMs: bigint;
  revoked: boolean;
  totalPaid: bigint;
  runCount: bigint;
}

export interface PayrollCapState {
  id: string;
  mandateId: string;
  owner: string;
  previousTransaction: string;
}

export interface SalaryStreamState {
  id: string;
  coinType: string;
  mandateId: string;
  employee: string;
  totalAmount: bigint;
  startedAtMs: bigint;
  endsAtMs: bigint;
  withdrawn: bigint;
}

function requirePositive(value: bigint, label: string): void {
  if (value <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
}

function requireBps(value: bigint, label: string): void {
  requirePositive(value, label);
  if (value > BPS_DENOMINATOR) {
    throw new Error(`${label} cannot exceed ${BPS_DENOMINATOR} basis points`);
  }
}

function target(packageId: string, functionName: string): string {
  return `${packageId}::payroll::${functionName}`;
}

export function buildCreatePayrollMandateTransaction(
  configInput: TreasuryConfig,
  input: CreatePayrollMandateInput,
): Transaction {
  const config = normalizeConfig(configInput);
  normalizeAddress(input.sender, 'sender');
  const capRecipient = normalizeAddress(input.capRecipient, 'PayrollCap recipient');

  if (input.approvedEmployees.length === 0) {
    throw new Error('At least one approved employee is required');
  }
  const employees = input.approvedEmployees.map((employee) =>
    normalizeAddress(employee, 'approved employee'),
  );
  if (new Set(employees).size !== employees.length) {
    throw new Error('Approved employees must not contain duplicates');
  }

  requirePositive(input.budget, 'Budget');
  requirePositive(input.maxPerRun, 'Maximum per run');
  requireBps(input.netMinBps, 'Net minimum');

  if (input.maxPerRun > input.budget) {
    throw new Error('Maximum per run cannot exceed the budget');
  }
  if (input.expiryMs <= BigInt(Date.now())) {
    throw new Error('Expiry must be in the future');
  }
  if (input.floors.length === 0) {
    throw new Error('At least one statutory floor is required');
  }

  const recipients = input.floors.map((floor) =>
    normalizeAddress(floor.recipient, 'statutory recipient'),
  );
  if (new Set(recipients).size !== recipients.length) {
    throw new Error('Statutory recipients must not contain duplicates');
  }

  input.floors.forEach((floor, index) => {
    // A zero floor is worse than no floor: it reads as enforcement and accepts
    // one base unit. The contract cannot tell the two apart, so refuse here.
    requireBps(floor.minBps, `Statutory minimum for recipient ${index + 1}`);
    if (floor.wageCap < 0n) {
      throw new Error(`Wage cap for recipient ${index + 1} cannot be negative`);
    }
  });

  const tx = new Transaction();
  const fundingCoin = tx.coin({ type: config.coinType, balance: input.budget });
  const payrollCap = tx.moveCall({
    target: target(config.packageId, 'create_payroll_mandate'),
    typeArguments: [config.coinType],
    arguments: [
      fundingCoin,
      tx.pure.vector('address', employees),
      tx.pure.vector('address', recipients),
      tx.pure.vector(
        'u64',
        input.floors.map((floor) => floor.minBps),
      ),
      tx.pure.vector(
        'u64',
        input.floors.map((floor) => floor.wageCap),
      ),
      tx.pure.u64(input.netMinBps),
      tx.pure.u64(input.maxPerRun),
      tx.pure.u64(input.expiryMs),
    ],
  });

  tx.transferObjects([payrollCap], capRecipient);
  return tx;
}

/**
 * Pays a wage and every statutory contribution in one transaction.
 *
 * Whether the amounts clear the floors is deliberately not checked here. That
 * is the contract's answer to give, and the safety demo depends on submitting a
 * short EPF payment and having the chain refuse it on abort 24. Checking floors
 * client-side would hide the guarantee this is meant to prove.
 */
export function buildRunPayrollTransaction(
  configInput: TreasuryConfig,
  input: RunPayrollInput,
): Transaction {
  const config = normalizeConfig(configInput);

  requirePositive(input.gross, 'Gross pay');
  requirePositive(input.net, 'Net pay');
  if (input.statutoryAmounts.length === 0) {
    throw new Error('At least one statutory amount is required');
  }
  input.statutoryAmounts.forEach((amount, index) => {
    requirePositive(amount, `Statutory amount ${index + 1}`);
  });

  const tx = new Transaction();
  tx.moveCall({
    target: target(config.packageId, 'run_payroll'),
    typeArguments: [config.coinType],
    arguments: [
      tx.object(normalizeAddress(input.payrollCapId, 'PayrollCap ID')),
      tx.object(normalizeAddress(input.mandateId, 'payroll mandate ID')),
      tx.pure.address(normalizeAddress(input.employee, 'employee')),
      tx.pure.u64(input.gross),
      tx.pure.u64(input.net),
      tx.pure.vector('u64', input.statutoryAmounts),
      tx.object(config.clockId),
    ],
  });
  return tx;
}

export function buildOpenStreamTransaction(
  configInput: TreasuryConfig,
  input: OpenStreamInput,
): Transaction {
  const config = normalizeConfig(configInput);

  requirePositive(input.totalAmount, 'Stream total');
  if (input.endsAtMs <= input.startedAtMs) {
    throw new Error('A stream must end after it starts');
  }

  const tx = new Transaction();
  tx.moveCall({
    target: target(config.packageId, 'open_stream'),
    typeArguments: [config.coinType],
    arguments: [
      tx.object(normalizeAddress(input.payrollCapId, 'PayrollCap ID')),
      tx.object(normalizeAddress(input.mandateId, 'payroll mandate ID')),
      tx.pure.address(normalizeAddress(input.employee, 'employee')),
      tx.pure.u64(input.totalAmount),
      tx.pure.u64(input.startedAtMs),
      tx.pure.u64(input.endsAtMs),
    ],
  });
  return tx;
}

/**
 * Pays a worker what they have already earned.
 *
 * Takes no capability and no recipient. The contract pays `stream.employee`
 * whoever signs, so anybody can settle a worker's stream and nobody can
 * redirect it, which is why this builder has nothing to authorize.
 */
export function buildWithdrawEarnedTransaction(
  configInput: TreasuryConfig,
  input: WithdrawEarnedInput,
): Transaction {
  const config = normalizeConfig(configInput);
  const tx = new Transaction();
  tx.moveCall({
    target: target(config.packageId, 'withdraw_earned'),
    typeArguments: [config.coinType],
    arguments: [
      tx.object(normalizeAddress(input.streamId, 'salary stream ID')),
      tx.object(normalizeAddress(input.mandateId, 'payroll mandate ID')),
      tx.object(config.clockId),
    ],
  });
  return tx;
}

/**
 * Returns whatever no stream has claimed to the employer.
 *
 * Takes no recipient. The contract sends it to the address that funded the
 * mandate, because the same capability runs payroll: a recipient argument would
 * let whoever holds it withdraw the budget to themselves.
 */
export function buildWithdrawPayrollRemainingTransaction(
  configInput: TreasuryConfig,
  input: RevokePayrollInput,
): Transaction {
  const config = normalizeConfig(configInput);
  const tx = new Transaction();
  tx.moveCall({
    target: target(config.packageId, 'withdraw_payroll_remaining'),
    typeArguments: [config.coinType],
    arguments: [
      tx.object(normalizeAddress(input.payrollCapId, 'PayrollCap ID')),
      tx.object(normalizeAddress(input.mandateId, 'payroll mandate ID')),
    ],
  });
  return tx;
}

export function buildRevokePayrollTransaction(
  configInput: TreasuryConfig,
  input: RevokePayrollInput,
): Transaction {
  const config = normalizeConfig(configInput);
  const tx = new Transaction();
  tx.moveCall({
    target: target(config.packageId, 'revoke_payroll'),
    typeArguments: [config.coinType],
    arguments: [
      tx.object(normalizeAddress(input.payrollCapId, 'PayrollCap ID')),
      tx.object(normalizeAddress(input.mandateId, 'payroll mandate ID')),
    ],
  });
  return tx;
}

type ObjectReader = Pick<SuiGrpcClient, 'getObject'>;

function parseCoinType(objectType: string, structName: string): string {
  const match = objectType.match(new RegExp(`::${structName}<(.+)>$`));
  if (!match?.[1]) throw new Error(`Object is not a Tali ${structName}: ${objectType}`);
  return match[1];
}

function asAddress(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${label} returned by Sui`);
  }
  return normalizeAddress(value, label);
}

async function readPayrollObject(
  client: ObjectReader,
  config: Required<TreasuryConfig>,
  objectIdInput: string,
  structName: string,
  label: string,
): Promise<{ objectId: string; type: string; fields: Record<string, unknown> }> {
  const objectId = normalizeAddress(objectIdInput, `${label} ID`);
  const { object } = await client.getObject({ objectId, include: { json: true } });

  const expectedPrefix = `${config.packageId}::payroll::${structName}<`;
  if (!object.type.startsWith(expectedPrefix)) {
    throw new Error(`Object ${objectId} is not a ${label} from the configured Tali package`);
  }

  return {
    objectId: object.objectId,
    type: object.type,
    fields: asRecord(object.json, `${label} data`),
  };
}

export async function readPayrollMandate(
  client: ObjectReader,
  configInput: TreasuryConfig,
  mandateIdInput: string,
): Promise<PayrollMandateState> {
  const config = normalizeConfig(configInput);
  const { objectId, type, fields } = await readPayrollObject(
    client,
    config,
    mandateIdInput,
    'PayrollMandate',
    'payroll mandate',
  );

  const employees = asStringVector(fields.approved_employees, 'approved employee list');
  const recipients = asStringVector(fields.statutory_recipients, 'statutory recipient list');
  const minBps = asBigIntVector(fields.statutory_min_bps, 'statutory minimum list');
  const wageCaps = asBigIntVector(fields.statutory_wage_cap, 'statutory wage cap list');

  if (recipients.length !== minBps.length || recipients.length !== wageCaps.length) {
    throw new Error('Statutory floor lists returned by Sui have different lengths');
  }

  const floors = recipients.map((recipient, index) => ({
    recipient: normalizeAddress(recipient, 'statutory recipient'),
    minBps: minBps[index] ?? 0n,
    wageCap: wageCaps[index] ?? 0n,
  }));

  const budget = balanceValue(fields.budget, 'payroll budget');
  const committed = asBigInt(fields.committed, 'committed amount');

  return {
    id: objectId,
    coinType: parseCoinType(type, 'PayrollMandate'),
    employer: asAddress(fields.employer, 'employer address'),
    approvedEmployees: employees.map((employee) =>
      normalizeAddress(employee, 'approved employee'),
    ),
    budget,
    committed,
    spendable: budget - committed,
    floors,
    netMinBps: asBigInt(fields.net_min_bps, 'net minimum'),
    maxPerRun: asBigInt(fields.max_per_run, 'maximum per run'),
    expiryMs: asBigInt(fields.expiry_ms, 'expiry'),
    revoked: asBoolean(fields.revoked, 'revoked flag'),
    totalPaid: asBigInt(fields.total_paid, 'total paid'),
    runCount: asBigInt(fields.run_count, 'run count'),
  };
}

export async function readPayrollCap(
  client: ObjectReader,
  configInput: TreasuryConfig,
  capIdInput: string,
): Promise<PayrollCapState> {
  const config = normalizeConfig(configInput);
  const capId = normalizeAddress(capIdInput, 'PayrollCap ID');
  const { object } = await client.getObject({
    objectId: capId,
    include: { json: true, previousTransaction: true },
  });
  const expectedType = `${config.packageId}::payroll::PayrollCap`;
  if (object.type !== expectedType) {
    throw new Error(`Object ${capId} is not a payroll cap from the configured Tali package`);
  }
  if (object.owner.$kind !== 'AddressOwner') {
    throw new Error(`Payroll cap ${capId} is not address-owned`);
  }
  if (!object.previousTransaction) {
    throw new Error(`Payroll cap ${capId} has no previous transaction`);
  }
  const fields = asRecord(object.json, 'payroll cap data');
  return {
    id: normalizeAddress(object.objectId, 'PayrollCap ID'),
    mandateId: asAddress(fields.mandate_id, 'cap mandate ID'),
    owner: normalizeAddress(object.owner.AddressOwner, 'PayrollCap owner'),
    previousTransaction: object.previousTransaction,
  };
}

export async function readSalaryStream(
  client: ObjectReader,
  configInput: TreasuryConfig,
  streamIdInput: string,
): Promise<SalaryStreamState> {
  const config = normalizeConfig(configInput);
  const { objectId, type, fields } = await readPayrollObject(
    client,
    config,
    streamIdInput,
    'SalaryStream',
    'salary stream',
  );

  return {
    id: objectId,
    coinType: parseCoinType(type, 'SalaryStream'),
    mandateId: asAddress(fields.mandate_id, 'stream mandate ID'),
    employee: asAddress(fields.employee, 'stream employee'),
    totalAmount: asBigInt(fields.total_amount, 'stream total'),
    startedAtMs: asBigInt(fields.started_at_ms, 'stream start'),
    endsAtMs: asBigInt(fields.ends_at_ms, 'stream end'),
    withdrawn: asBigInt(fields.withdrawn, 'withdrawn amount'),
  };
}
