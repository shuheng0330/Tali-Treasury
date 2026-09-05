import { CIRCLE_TESTNET_USDC_TYPE } from '@tali/treasury-sui';

import { ServerError } from '../errors';
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

/**
 * Held on `globalThis` for the same reason the payroll runs are: a page and a
 * route handler are separate module instances under Turbopack, so a closure
 * variable gave the screen one withdrawn total and the API another. The two
 * then disagreed about how much was left to draw.
 */
const SAMPLE_WITHDRAWN = Symbol.for('tali.streams.sampleWithdrawn');

function sampleWithdrawn(): { value: bigint } {
  const host = globalThis as unknown as Record<symbol, { value: bigint } | undefined>;
  host[SAMPLE_WITHDRAWN] ??= { value: 0n };
  return host[SAMPLE_WITHDRAWN];
}

function sampleChain(): StreamChainPort {
  const drawn = sampleWithdrawn();

  function only(streamId: string): void {
    if (streamId !== DEMO_STREAM_ID) {
      throw new ServerError('stream_not_found', 404, 'No such salary stream');
    }
  }

  return {
    async read(streamId): Promise<SalaryStreamState> {
      only(streamId);
      return {
        id: streamId,
        coinType: CIRCLE_TESTNET_USDC_TYPE,
        mandateId: '0xsample-payroll-mandate',
        employee: '0xsample-employee',
        totalAmount: SAMPLE_TOTAL,
        startedAtMs: BigInt(SAMPLE_START_MS),
        endsAtMs: BigInt(SAMPLE_START_MS + THIRTY_DAYS_MS),
        withdrawn: drawn.value,
      };
    },

    async withdraw(streamId): Promise<WithdrawSubmission> {
      only(streamId);
      const elapsed = BigInt(
        Math.min(Date.now(), SAMPLE_START_MS + THIRTY_DAYS_MS) - SAMPLE_START_MS,
      );
      const accrued =
        elapsed > 0n ? (SAMPLE_TOTAL * elapsed) / BigInt(THIRTY_DAYS_MS) : 0n;
      const available = accrued - drawn.value;

      if (available <= 0n) {
        return {
          status: 'refused',
          abortCode: 28,
          message: 'Nothing has accrued since the last withdrawal.',
        };
      }

      drawn.value = accrued;
      return { status: 'paid', digest: '', amount: available.toString() };
    },
  };
}

const services = new Map<string, StreamService>();

export function getStreamService(packageId?: string): StreamService {
  const key = packageId ?? 'default';
  let service = services.get(key);
  if (!service) {
    service = createStreamService({
      chain: streamsAreLive() ? createSuiStreamChain({ env: { ...process.env, ...(packageId ? { PAYROLL_PACKAGE_ID: packageId } : {}) } }) : sampleChain(),
      now: () => Date.now(),
    });
    services.set(key, service);
  }
  return service;
}

/**
 * True once registered-stream reads and withdrawals go to Sui rather than the
 * sample. Stream and package ids come from the authenticated registry; only
 * the server signer remains deployment configuration.
 */
export function streamsAreLive(env: EnvLike = process.env): boolean {
  return Boolean(env.AGENT_PRIVATE_KEY?.trim());
}

export const DEMO_STREAM_ID =
  process.env.DEMO_STREAM_ID || process.env.NEXT_PUBLIC_DEMO_STREAM_ID || '0xsample-stream';
