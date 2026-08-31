'use client';

import type { Claim } from '@tali/shared';
import { useCallback, useEffect, useState } from 'react';
import { listClaims, type Source } from '@/lib/api/client';
import { recentClaims } from '@/lib/mock/api';

export interface ClaimsState {
  claims: Claim[];
  source: Source;
  reason: string | null;
  loading: boolean;
}

/**
 * Renders the sample claims first and swaps in the real ones once they arrive.
 * Starting from the mock rather than from an empty list keeps the first paint
 * identical on the server and the client, and means a backend that is down
 * costs the demo nothing but a label.
 */
export function useClaims(): ClaimsState & { reload: () => void } {
  const [state, setState] = useState<ClaimsState>({
    claims: recentClaims,
    source: 'mock',
    reason: null,
    loading: true,
  });

  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;

    listClaims()
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
  }, [nonce]);

  return { ...state, reload };
}
