'use client';

import { useEffect, useRef, useState } from 'react';
import { toDisplay } from '@tali/shared';

interface Props {
  eventName: string;
  remaining: string;
  pendingCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RevokeDialog({ eventName, remaining, pendingCount, onCancel, onConfirm }: Props) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="revoke-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-modal border border-rule bg-surface p-6 shadow-float">
        <h2 id="revoke-title" className="text-heading">
          Revocation preview for &ldquo;{eventName}&rdquo;
        </h2>

        <p className="rounded-control border border-wait-line bg-wait-soft p-3 text-body text-wait">
          Simulation only. This integration does not sign or submit a revocation transaction.
        </p>

        <div className="flex flex-col gap-3 text-body text-ink-2">
          <p>
            The agent immediately stops being able to pay from this mandate.{' '}
            <span className="tnum">{toDisplay(remaining)}</span> stays locked in the mandate until the treasurer separately calls withdraw.
          </p>
          <p>
            Revocation is recorded on Sui and cannot be reversed. You would need to create a
            new mandate.
          </p>
          {pendingCount > 0 ? (
            <p className="text-wait">
              {pendingCount} {pendingCount === 1 ? 'claim is' : 'claims are'} awaiting review.
              They will be cancelled.
            </p>
          ) : null}
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-caption text-ink-3">
            Type <span className="font-mono text-ink">{eventName}</span> to confirm
          </span>
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="rounded-control border border-rule bg-canvas px-3 py-2 text-body outline-none focus-visible:border-accent"
          />
        </label>

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-control border border-rule px-4 py-2 text-caption transition-colors duration-150 hover:bg-raised"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={typed !== eventName}
            onClick={onConfirm}
            className="rounded-control bg-accent px-4 py-2 text-caption font-medium text-surface transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-rule-strong disabled:text-ink-3"
          >
            Close preview
          </button>
        </div>
      </div>
    </div>
  );
}
