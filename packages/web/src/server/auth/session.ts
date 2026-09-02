import { ServerError } from '../errors';
import type { WalletAuthRepository } from './service';
import { hashSessionToken } from './service';

export const SESSION_COOKIE_NAME = 'tali_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60;
const CANONICAL_SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

function isSecureOrigin(appOrigin: string): boolean {
  try {
    return new URL(appOrigin).protocol === 'https:';
  } catch {
    return false;
  }
}

export function createSessionCookie(input: {
  token: string;
  expiresAtMs: number;
  appOrigin: string;
}): string {
  void input.expiresAtMs;
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(input.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${isSecureOrigin(input.appOrigin) ? '; Secure' : ''}`;
}

export function clearSessionCookie(appOrigin: string): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isSecureOrigin(appOrigin) ? '; Secure' : ''}`;
}

export function assertSameOrigin(request: Request, appOrigin: string): void {
  if (request.headers.get('origin') !== appOrigin) {
    throw new ServerError(
      'origin_forbidden',
      403,
      'The request origin is not allowed',
    );
  }
}

function readCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName !== SESSION_COOKIE_NAME) continue;
    const value = rawValue.join('=');
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch {
      return '';
    }
  }
  return null;
}

function authenticationRequired(cause?: unknown): ServerError {
  return new ServerError(
    'authentication_required',
    401,
    'A valid wallet session is required',
    { cause },
  );
}

export async function resolveWalletIdentity(input: {
  request: Request;
  auth: WalletAuthRepository;
  nowMs?: number;
  legacyAddress?: string | null;
  env?: Record<string, string | undefined>;
}): Promise<{
  address: string;
  expiresAt: string | null;
  source: 'session' | 'demo';
}> {
  const nowMs = input.nowMs ?? Date.now();
  const token = readCookie(input.request);

  if (token !== null) {
    if (!token) throw authenticationRequired();
    try {
      const session = await input.auth.findSession(hashSessionToken(token), nowMs);
      if (!session || session.expiresAtMs <= nowMs) throw authenticationRequired();
      return {
        address: session.address,
        expiresAt: new Date(session.expiresAtMs).toISOString(),
        source: 'session',
      };
    } catch (error) {
      if (error instanceof ServerError && error.code === 'authentication_required') {
        throw error;
      }
      throw authenticationRequired(error);
    }
  }

  const env = input.env ?? process.env;
  if (
    env.TALI_ALLOW_INSECURE_DEMO_IDENTITY === 'true' &&
    input.legacyAddress &&
    CANONICAL_SUI_ADDRESS.test(input.legacyAddress)
  ) {
    return { address: input.legacyAddress, expiresAt: null, source: 'demo' };
  }

  throw authenticationRequired();
}

export async function revokeWalletSession(input: {
  request: Request;
  auth: WalletAuthRepository;
  nowMs?: number;
}): Promise<void> {
  const token = readCookie(input.request);
  if (!token) return;
  try {
    await input.auth.revokeSession(hashSessionToken(token), input.nowMs ?? Date.now());
  } catch (error) {
    throw authenticationRequired(error);
  }
}
