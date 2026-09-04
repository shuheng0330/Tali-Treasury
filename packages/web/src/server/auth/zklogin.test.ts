import { SuiGrpcClient } from '@mysten/sui/grpc';
import { getZkLoginSignature, toZkLoginPublicIdentifier } from '@mysten/sui/zklogin';
import { createTestnetClient } from '@tali/treasury-sui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCompleteWalletSessionService, type WalletAuthRepository } from './service';

vi.mock('@tali/treasury-sui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tali/treasury-sui')>();
  return { ...actual, createTestnetClient: vi.fn(actual.createTestnetClient) };
});

const nowMs = Date.parse('2026-09-01T12:00:00Z');
const challengeId = '32222222-2222-4222-8222-222222222222';
const message = 'Tali Treasury wallet sign-in\nNo transaction will be sent.';
const issuer = 'https://issuer.example';
const address = toZkLoginPublicIdentifier(42n, issuer, { legacyAddress: false }).toSuiAddress();

// Synthetic wire-format fixture, NOT a valid proof. The real SDK parser and
// verifier run; only the remote chain verification boundary is mocked below.
const signature = getZkLoginSignature({
  inputs: {
    proofPoints: { a: ['1', '2', '1'], b: [['1', '2'], ['3', '4']], c: ['1', '2', '1'] },
    issBase64Details: {
      value: Buffer.from(`"iss":"${issuer}",`).toString('base64url'),
      indexMod4: 0,
    },
    headerBase64: Buffer.from('{"alg":"RS256"}').toString('base64url'),
    addressSeed: '42',
  },
  maxEpoch: 100,
  userSignature: new Uint8Array(97),
});

function setup() {
  const client = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://rpc.example' });
  vi.mocked(createTestnetClient).mockReturnValue(client);
  const verify = vi.spyOn(client.core, 'verifyZkLoginSignature')
    .mockResolvedValue({ success: true, errors: [] });
  const challenge = { id: challengeId, address, message, expiresAtMs: nowMs + 60_000, consumedAtMs: null };
  const auth: WalletAuthRepository = {
    createChallenge: vi.fn(),
    getChallenge: vi.fn(async () => challenge),
    consumeChallenge: vi.fn(async (input) => ({ address: input.address, expiresAtMs: input.expiresAtMs })),
    findSession: vi.fn(),
    revokeSession: vi.fn(),
  };
  const complete = createCompleteWalletSessionService({ auth, now: () => nowMs });
  return { complete, verify, auth, challenge };
}

beforeEach(() => vi.stubEnv('SUI_GRPC_URL', 'https://rpc.example'));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('zkLogin wallet sessions', () => {
  it('passes the configured Testnet client into real SDK personal-message verification', async () => {
    const { complete, verify, auth } = setup();
    const result = await complete({ challengeId, signature });
    expect(createTestnetClient).toHaveBeenCalledWith('https://rpc.example');
    expect(verify).toHaveBeenCalledWith({
      address, bytes: Buffer.from(message).toString('base64'), signature, intentScope: 'PersonalMessage',
    });
    expect(result.session.address).toBe(address);
    expect(auth.consumeChallenge).toHaveBeenCalledOnce();
  });

  it.each([
    { success: false, errors: ['invalid proof'] },
    { success: true, errors: ['proof rejected'] },
  ])('does not create a session for a rejected proof: %j', async (response) => {
    const { complete, verify, auth } = setup();
    verify.mockResolvedValue(response);
    await expect(complete({ challengeId, signature })).rejects.toMatchObject({ code: 'authentication_failed', status: 401 });
    expect(verify).toHaveBeenCalledOnce();
    expect(auth.consumeChallenge).not.toHaveBeenCalled();
  });

  it('fails closed when the verification service is unavailable', async () => {
    const { complete, verify, auth } = setup();
    verify.mockRejectedValue(new Error('RPC unavailable'));
    await expect(complete({ challengeId, signature })).rejects.toMatchObject({ code: 'authentication_failed', status: 401 });
    expect(verify).toHaveBeenCalledOnce();
    expect(auth.consumeChallenge).not.toHaveBeenCalled();
  });

  it('still rejects a signature for a different wallet', async () => {
    const { complete, verify, auth, challenge } = setup();
    challenge.address = `0x${'a'.repeat(64)}`;
    await expect(complete({ challengeId, signature })).rejects.toMatchObject({ code: 'authentication_failed', status: 401 });
    // The SDK rejects the derived-address mismatch before querying the node.
    expect(verify).not.toHaveBeenCalled();
    expect(auth.consumeChallenge).not.toHaveBeenCalled();
  });

  it('rejects an expired challenge before any remote verification', async () => {
    const { complete, verify, auth, challenge } = setup();
    challenge.expiresAtMs = nowMs;
    await expect(complete({ challengeId, signature })).rejects.toMatchObject({ code: 'authentication_failed', status: 401 });
    expect(verify).not.toHaveBeenCalled();
    expect(auth.consumeChallenge).not.toHaveBeenCalled();
  });
});
