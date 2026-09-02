import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { describe, expect, it, vi } from 'vitest';

import {
  createCompleteWalletSessionService,
  createIssueWalletChallengeService,
  hashSessionToken,
  type WalletAuthRepository,
} from './service';

const nowMs = Date.parse('2026-09-01T12:00:00Z');
const origin = 'https://tali.example';

function repository(): WalletAuthRepository {
  return {
    createChallenge: vi.fn(async (input) => ({ id: '32222222-2222-4222-8222-222222222222', ...input })),
    getChallenge: vi.fn(),
    consumeChallenge: vi.fn(async (input) => ({
      address: input.address,
      expiresAtMs: input.expiresAtMs,
    })),
    findSession: vi.fn(),
    revokeSession: vi.fn(),
  };
}

describe('wallet challenge service', () => {
  it('issues a five-minute human-readable Testnet challenge', async () => {
    const repo = repository();
    const address = `0x${'a'.repeat(64)}`;
    const issue = createIssueWalletChallengeService({
      auth: repo,
      appOrigin: origin,
      now: () => nowMs,
      nonce: () => 'fixed-nonce',
    });

    const result = await issue({ address });

    expect(result.expiresAt).toBe('2026-09-01T12:05:00.000Z');
    expect(result.message).toContain('Tali Treasury wallet sign-in');
    expect(result.message).toContain(`Origin: ${origin}`);
    expect(result.message).toContain('Chain: sui:testnet');
    expect(result.message).toContain(`Address: ${address}`);
    expect(result.message).toContain('Nonce: fixed-nonce');
    expect(result.message).toContain('No transaction will be sent.');
    expect(repo.createChallenge).toHaveBeenCalledWith({
      address,
      message: result.message,
      expiresAtMs: nowMs + 5 * 60_000,
      createdAtMs: nowMs,
    });
  });

  it('rejects a non-canonical wallet before persistence', async () => {
    const repo = repository();
    const issue = createIssueWalletChallengeService({
      auth: repo,
      appOrigin: origin,
      now: () => nowMs,
    });

    await expect(issue({ address: '0x1234' })).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    });
    expect(repo.createChallenge).not.toHaveBeenCalled();
  });
});

describe.each([
  ['Ed25519', () => new Ed25519Keypair()],
  ['Secp256k1', () => new Secp256k1Keypair()],
] as const)('wallet session service with %s', (_scheme, keypairFactory) => {
  it('verifies the stored message and persists only the token hash', async () => {
    const signer = keypairFactory();
    const address = signer.toSuiAddress();
    const message = `Tali Treasury wallet sign-in\nAddress: ${address}`;
    const { signature } = await signer.signPersonalMessage(new TextEncoder().encode(message));
    const repo = repository();
    vi.mocked(repo.getChallenge).mockResolvedValue({
      id: '32222222-2222-4222-8222-222222222222',
      address,
      message,
      expiresAtMs: nowMs + 60_000,
      consumedAtMs: null,
    });
    const complete = createCompleteWalletSessionService({
      auth: repo,
      now: () => nowMs,
      sessionToken: () => 'raw-session-token',
    });

    const result = await complete({
      challengeId: '32222222-2222-4222-8222-222222222222',
      signature,
    });

    expect(result).toEqual({
      session: { address, expiresAt: '2026-09-01T13:00:00.000Z' },
      token: 'raw-session-token',
    });
    expect(repo.consumeChallenge).toHaveBeenCalledWith({
      challengeId: '32222222-2222-4222-8222-222222222222',
      address,
      tokenHash: hashSessionToken('raw-session-token'),
      expiresAtMs: nowMs + 60 * 60_000,
      nowMs,
    });
    expect(JSON.stringify(vi.mocked(repo.consumeChallenge).mock.calls)).not.toContain(
      'raw-session-token',
    );
  });
});

describe('wallet session rejection', () => {
  it('returns one safe error for a signature from the wrong wallet', async () => {
    const expected = new Ed25519Keypair();
    const attacker = new Ed25519Keypair();
    const message = 'Tali Treasury wallet sign-in';
    const { signature } = await attacker.signPersonalMessage(new TextEncoder().encode(message));
    const repo = repository();
    vi.mocked(repo.getChallenge).mockResolvedValue({
      id: '32222222-2222-4222-8222-222222222222',
      address: expected.toSuiAddress(),
      message,
      expiresAtMs: nowMs + 60_000,
      consumedAtMs: null,
    });
    const complete = createCompleteWalletSessionService({ auth: repo, now: () => nowMs });

    await expect(
      complete({
        challengeId: '32222222-2222-4222-8222-222222222222',
        signature,
      }),
    ).rejects.toMatchObject({
      code: 'authentication_failed',
      status: 401,
      message: 'Wallet authentication failed',
    });
    expect(repo.consumeChallenge).not.toHaveBeenCalled();
  });

  it('rejects expired and consumed challenges before signature verification', async () => {
    const repo = repository();
    vi.mocked(repo.getChallenge).mockResolvedValue({
      id: '32222222-2222-4222-8222-222222222222',
      address: `0x${'a'.repeat(64)}`,
      message: 'expired',
      expiresAtMs: nowMs,
      consumedAtMs: nowMs - 1,
    });
    const complete = createCompleteWalletSessionService({ auth: repo, now: () => nowMs });

    await expect(
      complete({ challengeId: '32222222-2222-4222-8222-222222222222', signature: 'bad' }),
    ).rejects.toMatchObject({ code: 'authentication_failed', status: 401 });
  });
});
