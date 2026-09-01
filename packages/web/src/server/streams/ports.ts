import type { SalaryStreamState } from '@tali/treasury-sui';
import type { Amount, ObjectId } from '@tali/shared';

/**
 * A stream as the chain holds it: bigint fields, no derived values. Accrual is
 * computed at read time against a clock, never stored.
 *
 * Re-exported rather than redeclared. `readSalaryStream` returns this exact
 * shape, so a local copy would drift the day the module gains a field.
 */
export type { SalaryStreamState };

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
