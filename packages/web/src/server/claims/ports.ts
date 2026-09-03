import type {
  Address,
  Claim,
  ClaimReview,
  ExpenseCategory,
  MandateView,
  ObjectId,
  PaymentResult,
  PolicyDecision,
  ReceiptAnalysis,
  FxQuote,
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

/** Internal persistence shape; API callers never provide these trusted fields. */
export interface LegacyCreateClaimRequest {
  eventId: string;
  submitter: Address;
  amount: string;
  merchant: string;
  receiptDate: string;
  category: ExpenseCategory;
  description: string;
  storagePath: string;
  analysis: ReceiptAnalysis;
}

export interface ClaimProcessContext {
  claim: Claim;
  paymentAttemptBudgetBefore: string | null;
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

export type ReviewMutationResult =
  | { status: 'saved'; claim: Claim }
  | { status: 'lost_race'; claim: Claim };

export type PaymentExecutionResult =
  | { status: 'paid'; payment: PaymentResult }
  | { status: 'rejected'; payment: PaymentResult };

export type PaymentReconciliationResult =
  | { status: 'pending'; digest: string }
  | PaymentExecutionResult;

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
  }, recordAttempt: (attempt: {
    digest: string;
    preparedAtMs: number;
  }) => Promise<void>): Promise<PaymentExecutionResult>;
  reconcile(input: {
    claimId: string;
    mandateId: string;
    recipient: string;
    amount: string;
    budgetBefore: string;
    digest: string;
    preparedAtMs: number;
  }): Promise<PaymentReconciliationResult>;
}

export interface ClaimRepository {
  assertEventExists(eventId: string): Promise<void>;
  assertActiveMember(eventId: string, submitter: Address): Promise<void>;
  assertEventViewer(eventId: string, viewer: Address): Promise<void>;
  findDuplicateReceipt(
    eventId: string,
    receiptHash: string,
  ): Promise<DuplicateReceipt | null>;
  create(input: LegacyCreateClaimRequest): Promise<Claim>;
  listByEvent(eventId: string): Promise<StoredClaim[]>;
  getProcessContext(claimId: string): Promise<ClaimProcessContext>;
  saveDecision(input: {
    quoteId?: string;
    claimId: string;
    decision: PolicyDecision;
    state: ProcessedClaimState;
  }): Promise<SaveDecisionResult>;
  applyReview(input: {
    quoteId?: string;
    claimId: string;
    review: ClaimReview;
  }): Promise<ReviewMutationResult>;
  reservePayment(claimId: string): Promise<PaymentMutationResult>;
  saveFxQuote?(input: {
    claim: Claim;
    quote: FxQuote;
  }): Promise<PaymentMutationResult>;
  recordPaymentAttempt(input: {
    claimId: string;
    digest: string;
    budgetBefore: string;
    preparedAtMs: number;
  }): Promise<PaymentMutationResult>;
  markPaymentAttemptChecked(input: {
    claimId: string;
    digest: string;
    checkedAtMs: number;
  }): Promise<PaymentMutationResult>;
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

export interface AnalysisDraftRepository {
  create(input: {
    eventId: string;
    walletAddress: Address;
    storagePath: string;
    receiptHash: string;
    analysis: ReceiptAnalysis;
    expiresAtMs: number;
    createdAtMs: number;
  }): Promise<{ id: string; expiresAtMs: number }>;
  consumeToClaim(input: {
    draftId: string;
    walletAddress: Address;
    amount: string;
    merchant: string;
    receiptDate: string;
    category: string;
    description: string;
    nowMs: number;
  }): Promise<Claim>;
}
