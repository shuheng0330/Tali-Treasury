import type { SafetyAttackRequest, SafetyAttackResponse } from '@tali/shared';
import { BROADCASTABLE_ATTACKS } from '@tali/shared';

import type { MandateReader, PaymentExecutor } from '../claims/ports';
import { ServerError } from '../errors';

export interface SafetyService {
  /** Throws when nothing can be signed, so no caller can mistake a refusal. */
  assertReady(): void;
  attack(request: SafetyAttackRequest): Promise<SafetyAttackResponse>;
}

/**
 * Sends a payment straight at the contract, skipping every check this app
 * performs.
 *
 * That is the entire point: a check we wrote is a check we could quietly
 * remove, so the only claim worth making is that the contract refuses. Nothing
 * here evaluates policy, and nothing here decides the outcome — it submits and
 * reports what came back.
 */
export function createSafetyService(deps: {
  executor: PaymentExecutor;
  mandates: MandateReader;
  mandateId: string;
}): SafetyService {
  return {
    assertReady() {
      deps.executor.assertReady();
    },

    async attack(request) {
      if (!BROADCASTABLE_ATTACKS.includes(request.attack)) {
        /* Revocation and an emptied budget are states of the mandate, not
           properties of a payment. Reaching them would break every other
           screen for the rest of the demo. */
        throw new ServerError(
          'invalid_request',
          400,
          'This attack needs the mandate to be revoked or already spent down, which cannot be arranged for one transaction. The screen shows it as a prediction instead.',
        );
      }

      deps.executor.assertReady();
      const mandate = await deps.mandates.read(deps.mandateId);

      const result = await deps.executor.execute(
        {
          claimId: `safety-${request.attack}`,
          mandateId: deps.mandateId,
          recipient: request.recipient,
          amount: request.amount,
          budgetBefore: mandate.remainingBudget,
        },
        /* No claim row exists for a safety test, so there is nowhere to write
           the digest and nothing to reconcile against later. */
        async () => {},
      );

      return { payment: result.payment, digest: result.payment.digest };
    },
  };
}
