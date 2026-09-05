'use client';

import { useEffect, useRef, useState } from 'react';

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

export interface AccrualClock {
  /** The instant to compute accrual against. */
  now: number;
  /** False until the first client render, so callers can hold their first paint. */
  mounted: boolean;
  /** True once nothing can accrue any further. */
  finished: boolean;
}

/**
 * A clock that ticks while wages are still accruing and stops when they are not.
 *
 * Starts at `initialMs` rather than the real time so the first paint is
 * identical on both sides of hydration; the real clock is only read after
 * mount. Where the reader has asked for reduced motion it ticks once a second
 * instead of once a frame, which is still live and costs nothing.
 *
 * It only advances a clock. The figures themselves are always recomputed from
 * the stream with the same integer arithmetic the contract uses, because adding
 * a fractional delta each frame compounds its error and within a minute offers
 * an amount the contract refuses.
 */
export function useAccrualClock(initialMs: number, stopAtMs: number): AccrualClock {
  const [now, setNow] = useState(initialMs);
  const [mounted, setMounted] = useState(false);
  const reduced = usePrefersReducedMotion();
  const frame = useRef<number | null>(null);

  const finished = now >= stopAtMs;

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

  return { now, mounted, finished };
}
