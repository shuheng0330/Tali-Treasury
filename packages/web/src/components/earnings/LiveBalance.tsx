'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError, SalaryStreamView, WithdrawEarnedResult } from '@tali/shared';
import { accruedAt, availableAt, toDisplay } from '@tali/shared';

import { RoleNotice } from '@/components/RoleNotice';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { EMPLOYEE_COPY, walletAccess } from '@/lib/wallet-access';

type WithdrawOutcome = WithdrawEarnedResult | { ok: 'unreachable'; message: string };

const CORRECTION_INTERVAL_MS = 15_000;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Ticks the figure between chain reads using the same integer arithmetic the
 * contract uses, then corrects against the chain every fifteen seconds.
 *
 * Adding a fractional delta each frame would be simpler and wrong: the error
 * compounds, and within a minute the screen offers an amount the contract
 * refuses.
 */
export function LiveBalance({ initial, mandateId }: { initial: SalaryStreamView; mandateId: string }) {
  const { address } = useWalletSession();
  const [stream, setStream] = useState(initial);
  const [now, setNow] = useState(() => initial.startedAtMs);
  const [withdrawing, setWithdrawing] = useState(false);
  const [result, setResult] = useState<WithdrawOutcome | null>(null);
  const [mounted, setMounted] = useState(false);

  const reduced = usePrefersReducedMotion();
  const frame = useRef<number | null>(null);

  /* The stream names its own employee, so this needs no configuration: the
     contract pays `stream.employee` whoever signs, and nobody else's wallet is
     the one this balance belongs to. */
  /* The single-wallet presentation shortcut must never offer an employee-only
     withdrawal to the employer. The API enforces the same immutable address. */
  const access = walletAccess(address, stream.employee, EMPLOYEE_COPY, {
    requireExpected: true,
  });

  const finished = now >= stream.endsAtMs;

  /* The server rendered against its own clock. Reading the real clock only
     after mount keeps the first paint identical on both sides. */
  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (!mounted || finished) return;

    if (reduced) {
      const timer = window.setInterval(() => setNow(Date.now()), 1000);
      return () => window.clearInterval(timer);
    }

    const tick = () => {
      setNow(Date.now());
      frame.current = window.requestAnimationFrame(tick);
    };
    frame.current = window.requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [mounted, reduced, finished]);

  const reload = useCallback(async () => {
    const response = await fetch(`/api/streams/${stream.id}?payroll=${encodeURIComponent(mandateId)}`, { cache: 'no-store' });
    if (!response.ok) return;
    setStream((await response.json()) as SalaryStreamView);
  }, [mandateId, stream.id]);

  useEffect(() => {
    if (!mounted) return;
    const timer = window.setInterval(reload, CORRECTION_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [mounted, reload]);

  const accrued = accruedAt(stream, now);
  const available = availableAt(stream, now);
  const nothingYet = BigInt(available) === 0n;

  const onWithdraw = useCallback(async () => {
    setWithdrawing(true);
    setResult(null);
    try {
      const response = await fetch(`/api/streams/${stream.id}/withdraw?payroll=${encodeURIComponent(mandateId)}`, {
        method: 'POST',
      });
      /* A non-2xx body is an ApiError, not a result. Casting it anyway left
         `ok` undefined, so neither branch below rendered and the button just
         went quiet. */
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as ApiError | null;
        setResult({
          ok: 'unreachable',
          message: failure?.message ?? 'The withdrawal could not be sent.',
        });
        return;
      }

      const body = (await response.json()) as WithdrawEarnedResult;
      setResult(body);
      /* Reset from a fresh read, never by subtracting locally: the chain is
         the authority on what was actually paid. */
      await reload();
    } finally {
      setWithdrawing(false);
    }
  }, [mandateId, stream.id, reload]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 rounded-card border border-rule bg-surface p-6">
        <span className="eyebrow">Earned so far</span>
        <p className="tnum text-hero leading-none" aria-live="off">
          {toDisplay(accrued, 6)}
        </p>
        <p className="text-caption text-ink-3">
          of {toDisplay(stream.totalAmount)} USDC across this pay period
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="eyebrow">Available to withdraw</span>
          <span className="tnum text-title">{toDisplay(available)}</span>
        </div>

        <RoleNotice access={access} />

        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!access.permitted || nothingYet || withdrawing}
          onClick={onWithdraw}
        >
          {withdrawing ? 'Withdrawing…' : 'Withdraw earned wages'}
        </button>

        {nothingYet ? (
          <p className="text-caption text-ink-3">
            {finished
              ? 'Everything earned in this period has been withdrawn.'
              : 'Nothing has accrued since your last withdrawal.'}
          </p>
        ) : (
          <p className="text-caption text-ink-3">
            You have already earned this. It is not an advance, so there is no
            interest and nothing to repay.
          </p>
        )}
      </div>

      {finished ? (
        <p className="rounded-card border border-rule bg-raised p-4 text-caption text-ink-2">
          This pay period has ended. The figure above is final.
        </p>
      ) : null}

      {result?.ok === 'unreachable' ? (
        <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">
          <span className="font-medium">Nothing was withdrawn.</span> {result.message}
        </p>
      ) : null}

      {result?.ok === false ? (
        <p className="rounded-card border border-wait-line bg-wait-soft p-4 text-caption text-wait">
          <span className="font-medium">The contract declined this withdrawal.</span>{' '}
          {result.message}
        </p>
      ) : null}

      {result?.ok === true ? (
        <p className="rounded-card border border-ok-line bg-ok-soft p-4 text-caption text-ok">
          <span className="font-medium">Withdrew {toDisplay(result.amount)} USDC.</span>{' '}
          {result.digest ? (
            <a
              className="link"
              href={`https://suiscan.xyz/testnet/tx/${result.digest}`}
              target="_blank"
              rel="noreferrer"
            >
              View the transaction
            </a>
          ) : (
            'Sample data — nothing was signed or broadcast.'
          )}
        </p>
      ) : null}
    </div>
  );
}
