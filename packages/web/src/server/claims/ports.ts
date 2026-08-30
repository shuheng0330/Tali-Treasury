import type {
  Address,
  Claim,
  CreateClaimRequest,
  ReceiptAnalysis,
} from '@tali/shared';

import type { ReceiptMimeType } from '../receipts/hash';

export interface DuplicateReceipt {
  claimId: string;
  analysis: ReceiptAnalysis;
  storagePath: string;
}

export interface StoredClaim {
  claim: Claim;
  storagePath: string;
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
