import type { Digest } from '@tali/shared';

export type RevokeSubmission =
  | { status: 'revoked'; digest: Digest }
  | { status: 'refused'; abortCode: number | null; message: string };

export interface RevokeMandatePort {
  /** Throws when nothing can be signed, so no caller mistakes a refusal. */
  assertReady(): void;
  revoke(mandateId: string): Promise<RevokeSubmission>;
}
