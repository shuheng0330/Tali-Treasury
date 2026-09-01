import type { Address, PayrollBreakdown, PayrollRunView, StatutoryBody } from '@tali/shared';

export type StatutoryRecipientConfig = Record<StatutoryBody, Address>;

export type PayrollSubmission =
  | { status: 'paid'; digest: string }
  /**
   * `abortCode` is null when the transaction failed without a Move abort, such
   * as running out of gas. The run is already persisted as pending by then, so
   * it has to be recordable as failed rather than left looking in flight.
   */
  | { status: 'refused'; abortCode: number | null; message: string };

export interface PayrollChainPort {
  /** Throws when the payroll module or its credentials are not configured. */
  assertReady(): void;
  run(input: {
    employee: Address;
    gross: string;
    net: string;
    /** Parallel to the mandate's statutory_recipients: epf, socso, eis. */
    statutoryAmounts: string[];
  }): Promise<PayrollSubmission>;
}

export interface PayrollRunRepository {
  create(input: { employee: Address; breakdown: PayrollBreakdown }): Promise<PayrollRunView>;
  markPaid(runId: string, digest: string): Promise<PayrollRunView>;
  markFailed(runId: string, abortCode: number | null): Promise<PayrollRunView>;
  listRecent(limit: number): Promise<PayrollRunView[]>;
}
