import type { ObjectId, SalaryStreamView, WithdrawEarnedResult } from '@tali/shared';
import { toSalaryStreamView } from '@tali/shared';

import type { StreamChainPort } from './ports';

export { toSalaryStreamView };

export interface StreamService {
  read(streamId: ObjectId): Promise<SalaryStreamView>;
  withdraw(streamId: ObjectId): Promise<WithdrawEarnedResult>;
}

export function createStreamService(deps: {
  chain: StreamChainPort;
  now: () => number;
}): StreamService {
  return {
    async read(streamId) {
      const state = await deps.chain.read(streamId);
      return toSalaryStreamView(state, deps.now());
    },

    async withdraw(streamId) {
      const submission = await deps.chain.withdraw(streamId);

      /* A refusal is the contract deciding, not the server failing. It carries
         the abort code back so the screen can name what happened. */
      if (submission.status === 'refused') {
        return {
          ok: false,
          abortCode: submission.abortCode,
          message: submission.message,
        };
      }

      return { ok: true, digest: submission.digest, amount: submission.amount };
    },
  };
}
