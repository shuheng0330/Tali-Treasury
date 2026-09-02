import { describe, expect, it, vi } from 'vitest';

import { createSupabaseWalletAuthRepository } from './wallet-auth-repository';

const challengeRow = {
  id: '32222222-2222-4222-8222-222222222222',
  wallet_address: `0x${'a'.repeat(64)}`,
  message: 'challenge',
  expires_at: '2026-09-01T12:05:00.000Z',
  consumed_at: null,
};

function builder(result: { data: unknown; error: unknown }) {
  const value = {
    insert: vi.fn(() => value),
    select: vi.fn(() => value),
    update: vi.fn(() => value),
    eq: vi.fn(() => value),
    is: vi.fn(() => value),
    gt: vi.fn(() => value),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  return value;
}

describe('Supabase wallet auth repository', () => {
  it('creates and maps a wallet challenge', async () => {
    const query = builder({ data: challengeRow, error: null });
    const client = { from: vi.fn(() => query), rpc: vi.fn() };
    const auth = createSupabaseWalletAuthRepository(client);

    await expect(
      auth.createChallenge({
        address: challengeRow.wallet_address,
        message: 'challenge',
        expiresAtMs: Date.parse(challengeRow.expires_at),
        createdAtMs: Date.parse('2026-09-01T12:00:00.000Z'),
      }),
    ).resolves.toEqual({
      id: challengeRow.id,
      address: challengeRow.wallet_address,
      message: 'challenge',
      expiresAtMs: Date.parse(challengeRow.expires_at),
      consumedAtMs: null,
    });
    expect(client.from).toHaveBeenCalledWith('wallet_auth_challenges');
    expect(query.insert).toHaveBeenCalledWith({
      wallet_address: challengeRow.wallet_address,
      message: 'challenge',
      expires_at: challengeRow.expires_at,
      created_at: '2026-09-01T12:00:00.000Z',
    });
  });

  it('atomically consumes the challenge through the service-role RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        wallet_address: challengeRow.wallet_address,
        expires_at: '2026-09-01T13:00:00.000Z',
      },
      error: null,
    }));
    const auth = createSupabaseWalletAuthRepository({ from: vi.fn(), rpc });

    await expect(
      auth.consumeChallenge({
        challengeId: challengeRow.id,
        address: challengeRow.wallet_address,
        tokenHash: 'b'.repeat(64),
        expiresAtMs: Date.parse('2026-09-01T13:00:00.000Z'),
        nowMs: Date.parse('2026-09-01T12:00:00.000Z'),
      }),
    ).resolves.toEqual({
      address: challengeRow.wallet_address,
      expiresAtMs: Date.parse('2026-09-01T13:00:00.000Z'),
    });
    expect(rpc).toHaveBeenCalledWith('create_wallet_session_from_challenge', {
      p_challenge_id: challengeRow.id,
      p_token_hash: 'b'.repeat(64),
      p_wallet_address: challengeRow.wallet_address,
      p_session_expires_at: '2026-09-01T13:00:00.000Z',
      p_now: '2026-09-01T12:00:00.000Z',
    });
  });

  it('finds only an active fixed-expiry session', async () => {
    const query = builder({
      data: {
        wallet_address: challengeRow.wallet_address,
        expires_at: '2026-09-01T13:00:00.000Z',
      },
      error: null,
    });
    const auth = createSupabaseWalletAuthRepository({
      from: vi.fn(() => query),
      rpc: vi.fn(),
    });
    const nowMs = Date.parse('2026-09-01T12:00:00.000Z');

    await expect(auth.findSession('c'.repeat(64), nowMs)).resolves.toEqual({
      address: challengeRow.wallet_address,
      expiresAtMs: Date.parse('2026-09-01T13:00:00.000Z'),
    });
    expect(query.eq).toHaveBeenCalledWith('token_hash', 'c'.repeat(64));
    expect(query.is).toHaveBeenCalledWith('revoked_at', null);
    expect(query.gt).toHaveBeenCalledWith('expires_at', '2026-09-01T12:00:00.000Z');
  });

  it('maps replay and database failures to safe errors', async () => {
    const replay = createSupabaseWalletAuthRepository({
      from: vi.fn(),
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: 'PT401', message: 'secret challenge detail' },
      })),
    });
    const result = replay.consumeChallenge({
      challengeId: challengeRow.id,
      address: challengeRow.wallet_address,
      tokenHash: 'b'.repeat(64),
      expiresAtMs: Date.parse('2026-09-01T13:00:00.000Z'),
      nowMs: Date.parse('2026-09-01T12:00:00.000Z'),
    });
    await expect(result).rejects.toMatchObject({
      code: 'authentication_failed',
      status: 401,
    });
    await expect(result).rejects.not.toThrow('secret challenge detail');
  });
});
