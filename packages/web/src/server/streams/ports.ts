import type { Address, Amount, ObjectId } from '@tali/shared';

/**
 * A stream as the chain holds it. Mirrors `MandateState` in
 * `@tali/treasury-sui`: bigint fields, no derived values. Accrual is computed
 * at read time against a clock, never stored.
 */
export interface SalaryStreamState {
  id: ObjectId;
  mandateId: ObjectId;
  employee: Address;
  totalAmount: bigint;
  startedAtMs: bigint;
  endsAtMs: bigint;
  withdrawn: bigint;
}

export type WithdrawSubmission =
  | { status: 'paid'; digest: string; amount: Amount }
  | { status: 'refused'; abortCode: number; message: string };

export interface StreamChainPort {
  read(streamId: ObjectId): Promise<SalaryStreamState>;
  withdraw(streamId: ObjectId): Promise<WithdrawSubmission>;
}

export class StreamNotConfiguredError extends Error {
  constructor() {
    super('Salary streams are not configured for this deployment');
    this.name = 'StreamNotConfiguredError';
  }
}
