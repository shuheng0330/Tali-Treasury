import type {
  Address,
  Claim,
  CreateClaimRequest,
  MandateView,
  ObjectId,
  PaymentResult,
  PolicyDecision,
  ReceiptAnalysis,
} from '@tali/shared';

import type { ReceiptMimeType } from '../receipts/hash';
import type { PolicyEventSnapshot } from '../policy/evaluate';

export interface DuplicateReceipt {
  claimId: string;
  analysis: ReceiptAnalysis;
  storagePath: string;
}

export interface StoredClaim {
  claim: Claim;
  storagePath: string;
}

export interface ClaimProcessContext {
  claim: Claim;
  event: PolicyEventSnapshot & {
    treasurer: Address;
    mandateId: ObjectId;
  };
}

export type ProcessedClaimState = 'approved' | 'awaiting_review' | 'rejected';

export type SaveDecisionResult =
  | { status: 'saved'; claim: Claim }
  | { status: 'lost_race'; claim: Claim };

export type TerminalPaymentState = 'paid' | 'payment_failed';

export type PaymentMutationResult =
  | { status: 'saved'; claim: Claim }
  | { status: 'lost_race'; claim: Claim };

export type PaymentExecutionResult =
  | { status: 'paid'; payment: PaymentResult }
  | { status: 'rejected'; payment: PaymentResult };

export interface MandateReader {
  read(mandateId: ObjectId): Promise<MandateView>;
}

export interface PaymentExecutor {
  assertReady(): void;
  execute(input: {
    claimId: string;
    mandateId: string;
    recipient: string;
    amount: string;
    budgetBefore: string;
  }): Promise<PaymentExecutionResult>;
}

export interface ClaimRepository {
  assertEventExists(eventId: string): Promise<void>;
  assertActiveMember(eventId: string, submitter: Address): Promise<void>;
  findDuplicateReceipt(
    eventId: string,
    receiptHash: string,
  ): Promise<DuplicateReceipt | null>;
  create(input: CreateClaimRequest): Promise<Claim>;
  listByEvent(eventId: string): Promise<StoredClaim[]>;
  getProcessContext(claimId: string): Promise<ClaimProcessContext>;
  saveDecision(input: {
    claimId: string;
    decision: PolicyDecision;
    state: ProcessedClaimState;
  }): Promise<SaveDecisionResult>;
  reservePayment(claimId: string): Promise<PaymentMutationResult>;
  failApprovedPayment(input: {
    claimId: string;
    payment: PaymentResult;
  }): Promise<PaymentMutationResult>;
  finishPayment(input: {
    claimId: string;
    state: TerminalPaymentState;
    payment: PaymentResult;
  }): Promise<PaymentMutationResult>;
}

export interface ReceiptStore {
  upload(input: {
    eventId: string;
    receiptHash: string;
    bytes: Uint8Array;
    mimeType: ReceiptMimeType;
  }): Promise<string>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
}
