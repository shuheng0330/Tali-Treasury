import type {
  Address,
  Amount,
  AuditEvent,
  Claim,
  Event,
  EventMember,
  ExpenseCategory,
  ObjectId,
  PaymentResult,
  PolicyDecision,
  ReceiptAnalysis,
  RuleId,
} from './claims.js';
import type { MandateView } from './mandate.js';

export interface ApiError {
  error: string;
  message: string;
  detail?: unknown;
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

/** POST /api/receipts/analyze — multipart, field name "receipt". */
export interface AnalyzeReceiptResponse {
  analysis: ReceiptAnalysis;
  storagePath: string;
  duplicateOf: string | null;
}

/** POST /api/claims */
export interface CreateClaimRequest {
  eventId: string;
  submitter: Address;
  amount: Amount;
  merchant: string;
  receiptDate: string;
  category: ExpenseCategory;
  description: string;
  storagePath: string;
  analysis: ReceiptAnalysis;
}

export interface CreateClaimResponse {
  claim: Claim;
}

/** Editable claim values used between receipt analysis and submission. */
export interface DraftClaim {
  merchant: string;
  amount: Amount;
  receiptDate: string;
  category: ExpenseCategory;
  description: string;
  recipient?: Address;
  confidence: number;
  receiptHash: string;
}

export interface ProcessClaimRequest {
  processor: Address;
}

/** POST /api/claims/:id/process — evaluates policy; payment may remain pending. */
export interface ProcessClaimResponse {
  claim: Claim;
  decision: PolicyDecision;
  payment: PaymentResult | null;
}

/** POST /api/claims/:id/review */
export interface ReviewClaimRequest {
  action: 'approve' | 'reject' | 'request_correction';
  reviewer: Address;
  reason?: string;
}

export interface ReviewClaimResponse {
  claim: Claim;
  payment: PaymentResult | null;
}

/** GET /api/events/:id */
export interface GetEventResponse {
  event: Event;
  mandate: MandateView;
  members: EventMember[];
  totals: {
    settled: Amount;
    committed: Amount;
    available: Amount;
    claimCount: number;
    autoPaidCount: number;
    reviewCount: number;
  };
}

/** GET /api/events/:id/claims?state=... */
export interface ListClaimsResponse {
  claims: Claim[];
  cursor: string | null;
}

/** GET /api/mandates/:objectId */
export interface GetMandateResponse {
  mandate: MandateView;
}

/** GET /api/claims/:id/audit */
export interface ClaimAuditResponse {
  events: AuditEvent[];
}

export type SafetyAttackId =
  | 'overspend'
  | 'unknown_recipient'
  | 'after_revocation'
  | 'drain_budget'
  | 'custom';

export interface SafetyAttackSpec {
  id: SafetyAttackId;
  label: string;
  description: string;
  guard: RuleId;
  expectedAbort: number | null;
}

export const SAFETY_ATTACKS: readonly SafetyAttackSpec[] = [
  {
    id: 'overspend',
    label: 'Overspend',
    description: 'Pay more than the per-claim cap',
    guard: 'per_claim_max',
    expectedAbort: 5,
  },
  {
    id: 'unknown_recipient',
    label: 'Unknown recipient',
    description: 'Pay an address that is not approved',
    guard: 'recipient_allowlist',
    expectedAbort: 7,
  },
  {
    id: 'after_revocation',
    label: 'After revocation',
    description: 'Revoke the mandate, then retry the same payment',
    guard: 'mandate_active',
    expectedAbort: 9,
  },
  {
    id: 'drain_budget',
    label: 'Drain budget',
    description: 'Pay more than the whole remaining budget',
    guard: 'total_budget',
    expectedAbort: 6,
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Any amount, any address',
    guard: 'per_claim_max',
    expectedAbort: null,
  },
];

/** POST /api/safety/simulate — dry run. No gas, no state change. */
export interface SafetySimulateRequest {
  mandateId: ObjectId;
  attack: SafetyAttackId;
  amount: Amount;
  recipient: Address;
}

export interface SafetySimulateResponse {
  willFail: boolean;
  predictedAbortCode: number | null;
  predictedAbortKey: string | null;
  predictedMessage: string;
  simulatedInMs: number;
}

/** UI-only input for the explicitly simulated safety preview. */
export interface SafetyPreviewInput {
  attack: SafetyAttackId;
  amount: Amount;
  recipient: Address;
  revokedFirst: boolean;
}

export interface ReviewQueueItem {
  claim: Claim;
  decision: PolicyDecision;
  agentNote: string;
  reason: 'rule_failed' | 'agent_uncertain';
}

/** POST /api/safety/attempt — signs and broadcasts for real. */
export interface SafetyAttemptRequest extends SafetySimulateRequest {
  bypassAppChecks: boolean;
}

export interface SafetyAttemptResponse {
  result: PaymentResult;
  checks: PolicyDecision['checks'];
  mandateBefore: MandateView;
  mandateAfter: MandateView;
  explorer: { suiscan: string; suivision: string };
}

export const EXPLORER = {
  tx: (digest: string) => ({
    suiscan: `https://suiscan.xyz/testnet/tx/${digest}`,
    suivision: `https://testnet.suivision.xyz/txblock/${digest}`,
  }),
  object: (id: string) => ({
    suiscan: `https://suiscan.xyz/testnet/object/${id}`,
    suivision: `https://testnet.suivision.xyz/object/${id}`,
  }),
};
