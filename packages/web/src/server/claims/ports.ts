import type {
  Address,
  Claim,
  ClaimReview,
  CreateClaimRequest,
  ExpenseCategory,
  FxQuote,
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

/** Where a treasurer's decision can leave a claim. */
export type ReviewedClaimState = 'approved' | 'rejected' | 'needs_correction';

export interface ClaimCorrections {
  merchant: string;
  amount: string;
  receiptDate: string;
  category: ExpenseCategory;
  description: string;
}

export type ResubmitResult =
  | { status: 'saved'; claim: Claim }
  /** Somebody moved it on first. The correction does not apply any more. */
  | { status: 'lost_race'; claim: Claim };

export type SaveReviewResult =
  | { status: 'saved'; claim: Claim }
  /** Somebody else reviewed it first. Their decision stands. */
  | { status: 'lost_race'; claim: Claim };

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
  resubmit(input: {
    claimId: string;
    corrections: ClaimCorrections;
  }): Promise<ResubmitResult>;
  applyReview(input: {
    quoteId?: string;
    claimId: string;
    review: ClaimReview;
  }): Promise<ReviewMutationResult>;
  saveFxQuote?(input: {
    claim: Claim;
    quote: FxQuote;
  }): Promise<PaymentMutationResult>;
  /**
   * A failed MYR payment cannot reuse an expired quote. This returns the
   * claim to the treasurer's quote-and-review workflow only after a confirmed
   * failed attempt, so it never retries an uncertain on-chain submission.
   */
  restartExpiredPaymentQuote(claimId: string): Promise<PaymentMutationResult>;
  /**
   * Takes the claim for a payment attempt.
   *
   * `from` is `payment_failed` on a retry: that state is only ever written
   * when nothing was paid — a policy refusal caught before submission, or a
   * contract abort the chain confirmed — so re-attempting it cannot pay twice.
   */
  reservePayment(
    claimId: string,
    from?: 'approved' | 'payment_failed',
  ): Promise<PaymentMutationResult>;
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
