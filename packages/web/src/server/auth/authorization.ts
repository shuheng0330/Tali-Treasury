import type { EnvLike } from '../env';
import { ServerError } from '../errors';
import { assertSameOrigin } from './session';

const CANONICAL_SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

export type ResolveRequestIdentity = (request: Request) => Promise<string>;

export function requireEmployerWallet(env: EnvLike = process.env): string {
  const address = env.TALI_EMPLOYER_WALLET?.trim();
  if (!address || !CANONICAL_SUI_ADDRESS.test(address)) {
    throw new ServerError(
      'authorization_configuration_failed',
      503,
      'Authorization configuration is unavailable',
    );
  }
  return address;
}

export function assertAuthorizedWallet(actual: string, expected: string): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new ServerError(
      'forbidden',
      403,
      'This wallet is not authorized for this action',
    );
  }
}

export async function authorizeEmployerRequest(input: {
  request: Request;
  appOrigin: string;
  resolveIdentity: ResolveRequestIdentity;
  env?: EnvLike;
}): Promise<string> {
  assertSameOrigin(input.request, input.appOrigin);
  const actor = await input.resolveIdentity(input.request);
  assertAuthorizedWallet(actor, requireEmployerWallet(input.env));
  return actor;
}
