import type { SafetyAttackRequest, SafetyAttackResponse } from '@tali/shared';
import { BROADCASTABLE_ATTACKS } from '@tali/shared';
import { TaliApiError, responseJson } from '@/lib/api/client';

export type AttackOutcome =
  | { kind: 'broadcast'; response: SafetyAttackResponse }
  /** Nothing was sent. The caller falls back to the prediction and says so. */
  | { kind: 'predicted'; reason: string };

function describe(error: unknown): string {
  if (!(error instanceof TaliApiError)) {
    return error instanceof Error && error.name === 'TimeoutError'
      ? 'the backend did not answer in time'
      : 'the backend is unreachable';
  }
  if (error.status === 404) return 'the safety endpoint is not built yet';
  if (error.code === 'authentication_required') {
    return 'the demo identity API is switched off';
  }
  if (error.code === 'payment_configuration_failed') {
    return 'this deployment has no signing key, so nothing can be broadcast';
  }
  return error.message.charAt(0).toLowerCase() + error.message.slice(1);
}

/**
 * Two of the five attacks cannot be broadcast at all: one needs the mandate
 * revoked and one needs its budget already spent down, and arranging either
 * would break every other screen for the rest of the demo.
 */
export function canBroadcast(attack: SafetyAttackRequest['attack']): boolean {
  return BROADCASTABLE_ATTACKS.includes(attack);
}

export async function tryAttack(request: SafetyAttackRequest): Promise<AttackOutcome> {
  if (!canBroadcast(request.attack)) {
    return {
      kind: 'predicted',
      reason: 'this attack needs mandate state that cannot be arranged for one transaction',
    };
  }

  try {
    const response = await fetch('/api/safety/attack', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    return { kind: 'broadcast', response: await responseJson<SafetyAttackResponse>(response) };
  } catch (error) {
    return { kind: 'predicted', reason: describe(error) };
  }
}
