export interface TreasuryConfig {
  packageId: string;
  coinType: string;
  clockId?: string;
}

export interface MandateState {
  id: string;
  coinType: string;
  initialBudget: bigint;
  remainingBudget: bigint;
  amountSpent: bigint;
  maxPerClaim: bigint;
  expiryMs: bigint;
  revoked: boolean;
  approvedRecipients: string[];
}

export interface CreateMandateInput {
  sender: string;
  agent: string;
  budget: bigint;
  maxPerClaim: bigint;
  expiryMs: bigint;
  approvedRecipients: string[];
}

export interface SpendInput {
  agentCapId: string;
  mandateId: string;
  recipient: string;
  amount: bigint;
}

export interface RevokeInput {
  adminCapId: string;
  mandateId: string;
}

export interface WithdrawInput extends RevokeInput {
  recipient: string;
}

export interface TreasuryError {
  code: number | null;
  key: string;
  message: string;
  retryable: boolean;
  rawMessage: string;
}
