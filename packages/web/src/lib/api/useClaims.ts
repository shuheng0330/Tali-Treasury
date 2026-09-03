'use client';

import type { Claim } from '@tali/shared';
import { useCallback, useEffect, useState } from 'react';
import { tryListClaims, type Source } from '@/lib/api/demo';
import { recentClaims } from '@/lib/mock/api';

export interface ClaimsState {
  claims: Claim[];
  source: Source;
  reason: string | null;
  loading: boolean;
}

/**
 * Renders the sample claims first and swaps in the real ones once they arrive.
 * Starting from the sample rather than from an empty list keeps the first paint
 * identical on the server and the client, and means a backend that is down
 * costs the demo nothing but a label.
 */
export function useClaims(
  enabled: boolean,
  /** Read as this address when no wallet session exists. */
  viewer?: string,
): ClaimsState & { reload: () => void } {
  const [state, setState] = useState<ClaimsState>({
    claims: recentClaims,
    source: 'mock',
    reason: null,
    loading: enabled,
  });

  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState({
        claims: recentClaims,
        source: 'mock',
        reason: 'wallet sign-in is required',
        loading: false,
      });
      return;
    }

    let live = true;

    tryListClaims(viewer)
      .then((result) => {
        if (!live) return;
        setState({
          claims: result.data,
          source: result.source,
          reason: result.reason,
          loading: false,
        });
      })
      .catch(() => {
        if (!live) return;
        setState((current) => ({ ...current, loading: false }));
      });

    return () => {
      live = false;
    };
  }, [nonce, enabled, viewer]);

  return { ...state, reload };
}
