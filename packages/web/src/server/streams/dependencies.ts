import { CIRCLE_TESTNET_USDC_TYPE } from '@tali/treasury-sui';
import type { EnvLike } from '../env';

import { createSuiStreamChain } from '../sui/stream-chain';
import { createStreamService, type StreamService } from './service';
import type { SalaryStreamState, StreamChainPort, WithdrawSubmission } from './ports';

/**
 * The chain adapter lands with the payroll module in `@tali/treasury-sui`.
 * Until then this serves a fixed sample stream so the screen can be built and
 * reviewed, and the swap is this one function.
 *
 * The sample is anchored to a constant rather than to `Date.now()` at module
 * scope: a start time that moves between the server render and the client
 * render produces a different figure on each side and a hydration mismatch.
 */
const SAMPLE_START_MS = Date.UTC(2026, 8, 1, 0, 0, 0);
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** RM 3,000 over thirty days, in base units. */
const SAMPLE_TOTAL = 3_000_000_000n;

function sampleChain(): StreamChainPort {
  let withdrawn = 0n;

  return {
    async read(streamId): Promise<SalaryStreamState> {
      return {
        id: streamId,
        coinType: CIRCLE_TESTNET_USDC_TYPE,
        mandateId: '0xsample-payroll-mandate',
        employee: '0xsample-employee',
        totalAmount: SAMPLE_TOTAL,
        startedAtMs: BigInt(SAMPLE_START_MS),
        endsAtMs: BigInt(SAMPLE_START_MS + THIRTY_DAYS_MS),
        withdrawn,
      };
    },

    async withdraw(): Promise<WithdrawSubmission> {
      const elapsed = BigInt(
        Math.min(Date.now(), SAMPLE_START_MS + THIRTY_DAYS_MS) - SAMPLE_START_MS,
      );
      const accrued =
        elapsed > 0n ? (SAMPLE_TOTAL * elapsed) / BigInt(THIRTY_DAYS_MS) : 0n;
      const available = accrued - withdrawn;

      if (available <= 0n) {
        return {
          status: 'refused',
          abortCode: 28,
          message: 'Nothing has accrued since the last withdrawal.',
        };
      }

      withdrawn = accrued;
      return { status: 'paid', digest: '', amount: available.toString() };
    },
  };
}

let service: StreamService | undefined;

export function getStreamService(): StreamService {
  if (!service) {
    service = createStreamService({
      chain: streamsAreLive() ? createSuiStreamChain() : sampleChain(),
      now: () => Date.now(),
    });
  }
  return service;
}

/**
 * True once stream reads and withdrawals go to Sui rather than the sample.
 * Both the published stream and a signer are required: a stream id on its own
 * would read real figures under a withdraw button that cannot pay.
 */
export function streamsAreLive(env: EnvLike = process.env): boolean {
  const streamId = env.DEMO_STREAM_ID?.trim() || env.NEXT_PUBLIC_DEMO_STREAM_ID?.trim();
  return Boolean(env.AGENT_PRIVATE_KEY?.trim() && env.PAYROLL_PACKAGE_ID?.trim() && streamId);
}

export const DEMO_STREAM_ID =
  process.env.DEMO_STREAM_ID || process.env.NEXT_PUBLIC_DEMO_STREAM_ID || '0xsample-stream';
