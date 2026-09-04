import { createHash, randomBytes } from 'node:crypto';

import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { createTestnetClient } from '@tali/treasury-sui';
import { z } from 'zod';

import { ServerError, isServerError } from '../errors';

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 60 * 60_000;
const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

export interface WalletChallengeRecord {
  id: string;
  address: string;
  message: string;
  expiresAtMs: number;
  consumedAtMs: number | null;
}

export interface WalletSessionRecord {
  address: string;
  expiresAtMs: number;
}

export interface WalletAuthRepository {
  createChallenge(input: {
    address: string;
    message: string;
    expiresAtMs: number;
    createdAtMs: number;
  }): Promise<WalletChallengeRecord>;
  getChallenge(id: string): Promise<WalletChallengeRecord | null>;
  consumeChallenge(input: {
    challengeId: string;
    address: string;
    tokenHash: string;
    expiresAtMs: number;
    nowMs: number;
  }): Promise<WalletSessionRecord>;
  findSession(tokenHash: string, nowMs: number): Promise<WalletSessionRecord | null>;
  revokeSession(tokenHash: string, nowMs: number): Promise<void>;
}

function authenticationFailed(cause?: unknown): ServerError {
  return new ServerError(
    'authentication_failed',
    401,
    'Wallet authentication failed',
    { cause },
  );
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createIssueWalletChallengeService(deps: {
  auth: WalletAuthRepository;
  appOrigin: string;
  now?: () => number;
  nonce?: () => string;
}) {
  const now = deps.now ?? Date.now;
  const nonce = deps.nonce ?? (() => randomBytes(32).toString('base64url'));

  return async (input: unknown) => {
    const parsed = z.object({ address: z.string().regex(SUI_ADDRESS) }).strict().safeParse(input);
    if (!parsed.success) {
      throw new ServerError('invalid_request', 400, 'Invalid wallet address', {
        cause: parsed.error,
      });
    }

    const createdAtMs = now();
    const expiresAtMs = createdAtMs + CHALLENGE_TTL_MS;
    const message = [
      'Tali Treasury wallet sign-in',
      '',
      `Origin: ${deps.appOrigin}`,
      'Chain: sui:testnet',
      `Address: ${parsed.data.address}`,
      `Nonce: ${nonce()}`,
      `Issued At: ${new Date(createdAtMs).toISOString()}`,
      `Expiration Time: ${new Date(expiresAtMs).toISOString()}`,
      '',
      'Sign in to submit or review event claims. No transaction will be sent.',
    ].join('\n');

    const challenge = await deps.auth.createChallenge({
      address: parsed.data.address,
      message,
      expiresAtMs,
      createdAtMs,
    });
    return {
      challengeId: challenge.id,
      message,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  };
}

export function createCompleteWalletSessionService(deps: {
  auth: WalletAuthRepository;
  now?: () => number;
  sessionToken?: () => string;
}) {
  const now = deps.now ?? Date.now;
  const sessionToken = deps.sessionToken ?? (() => randomBytes(32).toString('base64url'));
  // zkLogin proofs need a chain-backed verifier; ordinary signatures still
  // verify locally. Use the same Testnet client factory as treasury reads.
  const verificationClient = createTestnetClient(process.env.SUI_GRPC_URL);

  return async (input: unknown): Promise<{
    session: { address: string; expiresAt: string };
    token: string;
  }> => {
    const parsed = z
      .object({
        challengeId: z.string().uuid(),
        signature: z.string().trim().min(1).max(2048),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw authenticationFailed(parsed.error);

    let challenge: WalletChallengeRecord | null;
    try {
      challenge = await deps.auth.getChallenge(parsed.data.challengeId);
    } catch (error) {
      throw authenticationFailed(error);
    }

    const nowMs = now();
    if (!challenge || challenge.consumedAtMs !== null || challenge.expiresAtMs <= nowMs) {
      throw authenticationFailed();
    }

    try {
      await verifyPersonalMessageSignature(
        new TextEncoder().encode(challenge.message),
        parsed.data.signature,
        { address: challenge.address, client: verificationClient },
      );
    } catch (error) {
      throw authenticationFailed(error);
    }

    const token = sessionToken();
    const expiresAtMs = nowMs + SESSION_TTL_MS;
    let stored: WalletSessionRecord;
    try {
      stored = await deps.auth.consumeChallenge({
        challengeId: challenge.id,
        address: challenge.address,
        tokenHash: hashSessionToken(token),
        expiresAtMs,
        nowMs,
      });
    } catch (error) {
      if (isServerError(error)) throw error;
      throw authenticationFailed(error);
    }

    return {
      session: {
        address: stored.address,
        expiresAt: new Date(stored.expiresAtMs).toISOString(),
      },
      token,
    };
  };
}
