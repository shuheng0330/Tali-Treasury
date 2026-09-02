export type Address = string;
export type ObjectId = string;
export type Digest = string;

/** Six-decimal fixed-point units as a decimal string, so amounts survive JSON. */
export type Amount = string;

export type ExpenseCategory =
  | 'food'
  | 'printing'
  | 'transport'
  | 'venue'
  | 'materials'
  | 'other';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'food',
  'printing',
  'transport',
  'venue',
  'materials',
  'other',
];

export type ClaimState =
  | 'draft'
  | 'analysing'
  | 'needs_correction'
  | 'submitted'
  | 'awaiting_review'
  | 'approved'
  | 'paying'
  | 'paid'
  | 'rejected'
  | 'payment_failed';

export type ClaimChip =
  | 'draft'
  | 'analysing'
  | 'needs_correction'
  | 'submitted'
  | 'needs_review'
  | 'approved'
  | 'paid'
  | 'rejected'
  | 'payment_failed';

export const CLAIM_CHIP: Record<ClaimState, ClaimChip> = {
  draft: 'draft',
  analysing: 'analysing',
  needs_correction: 'needs_correction',
  submitted: 'submitted',
  awaiting_review: 'needs_review',
  approved: 'approved',
  paying: 'approved',
  paid: 'paid',
  rejected: 'rejected',
  payment_failed: 'payment_failed',
};

export const CLAIM_CHIP_LABEL: Record<ClaimChip, string> = {
  draft: 'Draft',
  analysing: 'Analysing',
  needs_correction: 'Needs correction',
  submitted: 'Submitted',
  needs_review: 'Needs review',
  approved: 'Approved',
  paid: 'Paid',
  rejected: 'Rejected',
  payment_failed: 'Payment failed',
};

export type UncertainField = 'merchant' | 'amount' | 'receiptDate' | 'category';

export interface ReceiptAnalysis {
  merchant: string | null;
  amount: Amount | null;
  currency: string | null;
  receiptDate: string | null;
  category: ExpenseCategory | null;
  /** Routing threshold only. Never rendered — see docs/DESIGN.md. */
  confidence: number;
  uncertainFields: UncertainField[];
  warnings: string[];
  receiptHash: string;
  fuzzyKey: string;
}

export type RuleId =
  | 'per_claim_max'
  | 'total_budget'
  | 'recipient_allowlist'
  | 'mandate_active'
  | 'not_expired'
  | 'not_duplicate'
  | 'category_allowed'
  | 'receipt_date_valid'
  | 'confidence_sufficient';

/** Rules the Move contract enforces, mapped to their abort codes. */
export const ON_CHAIN_RULES: Partial<Record<RuleId, number>> = {
  per_claim_max: 5,
  total_budget: 6,
  recipient_allowlist: 7,
  not_expired: 8,
  mandate_active: 9,
};

export interface RuleCheck {
  rule: RuleId;
  passed: boolean;
  label: string;
  detail: string;
  onChain: boolean;
}

export type PolicyOutcome = 'auto_pay' | 'review' | 'reject';

export interface PolicyDecision {
  outcome: PolicyOutcome;
  checks: RuleCheck[];
  reason: string;
  evaluatedAtMs: number;
}

export interface PaymentResult {
  ok: boolean;
  digest: Digest | null;
  checkpoint: string | null;
  gasUsed: Amount | null;
  finalityMs: number | null;
  abortCode: number | null;
  abortKey: string | null;
  message: string;
  rawError: string | null;
  budgetBefore: Amount;
  budgetAfter: Amount;
}

export interface ClaimPaymentAttempt {
  digest: Digest;
  preparedAtMs: number;
  lastCheckedAtMs: number | null;
}

export type ClaimReviewAction = 'approve' | 'reject' | 'request_correction';

export interface ClaimReview {
  action: ClaimReviewAction;
  reviewer: Address;
  reason: string | null;
  reviewedAtMs: number;
}

export interface Claim {
  id: string;
  eventId: string;
  submitter: Address;
  submitterName: string;
  state: ClaimState;
  amount: Amount;
  merchant: string;
  receiptDate: string;
  category: ExpenseCategory;
  description: string;
  receiptUrl: string | null;
  receiptHash: string;
  analysis: ReceiptAnalysis | null;
  decision: PolicyDecision | null;
  review: ClaimReview | null;
  paymentAttempt: ClaimPaymentAttempt | null;
  payment: PaymentResult | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface Event {
  id: string;
  name: string;
  organisation: string;
  mandateId: ObjectId;
  treasurer: Address;
  allowedCategories: ExpenseCategory[];
  createdAtMs: number;
}

export interface EventMember {
  eventId: string;
  address: Address;
  displayName: string;
  addedAtMs: number;
}

export type AuditActor = 'human' | 'agent' | 'chain';

export type AuditKind =
  | 'claim_submitted'
  | 'receipt_parsed'
  | 'agent_escalated'
  | 'agent_auto_approved'
  | 'approved_by_human'
  | 'rejected_by_human'
  | 'correction_requested_by_human'
  | 'payment_sent'
  | 'payment_rejected'
  | 'mandate_created'
  | 'mandate_revoked'
  | 'funds_withdrawn';

export interface AuditEvent {
  id: string;
  claimId: string | null;
  mandateId: ObjectId;
  kind: AuditKind;
  actor: AuditActor;
  actorLabel: string;
  atMs: number;
  seq: number;
  summary: string;
  detail: Record<string, unknown>;
  digest: Digest | null;
}
