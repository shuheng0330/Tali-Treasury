import type {
  Address,
  Amount,
  LeaveKind,
  LeaveRequest,
  ObjectId,
  OvertimeClaim,
  OvertimeKind,
} from '@tali/shared';

export interface NewOvertimeClaim {
  mandateId: ObjectId | null;
  employee: Address;
  workedOn: string;
  kind: OvertimeKind;
  hours: string;
  reason: string;
  monthlyWage: Amount;
  pay: Amount;
}

export interface NewLeaveRequest {
  employee: Address;
  startOn: string;
  endOn: string;
  days: string;
  kind: LeaveKind;
  reason: string;
  monthlyWage: Amount;
  deduction: Amount;
}

export interface Decision {
  id: string;
  status: 'approved' | 'rejected';
  reason: string | null;
  decidedAtMs: number;
}

export interface OvertimeRepository {
  createClaim(input: NewOvertimeClaim): Promise<OvertimeClaim>;
  listClaims(limit: number): Promise<OvertimeClaim[]>;
  findClaim(id: string): Promise<OvertimeClaim | null>;
  /**
   * Decides a claim only while it is still awaiting one, and answers null when
   * it was not. The condition lives in the write itself rather than in a read
   * before it, so two reviewers pressing at once produce one decision and one
   * conflict instead of a silent overwrite.
   */
  decideClaim(decision: Decision): Promise<OvertimeClaim | null>;
  /** Moves the employee's approved claims onto the run that paid them. */
  settleClaims(input: { employee: Address; runId: string }): Promise<OvertimeClaim[]>;
  createLeave(input: NewLeaveRequest): Promise<LeaveRequest>;
  listLeave(limit: number): Promise<LeaveRequest[]>;
  findLeave(id: string): Promise<LeaveRequest | null>;
  decideLeave(decision: Decision): Promise<LeaveRequest | null>;
}

/**
 * The wage a claim is measured against, read once at submission.
 *
 * The registered payroll says which mandate the claim belongs to; it does not
 * carry a wage, so the wage of record is the one the mandate was sized for.
 * Either way the answer is copied onto the row, because a wage that changes in
 * November must not restate what October's approved overtime was worth.
 */
export interface WageOfRecordPort {
  resolve(employee: Address): Promise<{ mandateId: ObjectId | null; monthlyWage: Amount }>;
}
