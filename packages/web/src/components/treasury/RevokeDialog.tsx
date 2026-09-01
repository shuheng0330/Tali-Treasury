'use client';

import { useEffect, useRef, useState } from 'react';
import { EXPLORER, toDisplay } from '@tali/shared';
import { tryRevokeMandate, type RevokeOutcome } from '@/lib/api/mandate';

interface Props {
  eventName: string;
  remaining: string;
  pendingCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RevokeDialog({ eventName, remaining, pendingCount, onCancel, onConfirm }: Props) {
  const [typed, setTyped] = useState('');
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<RevokeOutcome | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function confirm() {
    setSending(true);
    const result = await tryRevokeMandate({ confirm: typed, expected: eventName });
    setSending(false);
    setOutcome(result);
    if (result.kind === 'revoked') onConfirm();
  }

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
          Revoke &ldquo;{eventName}&rdquo;
        </h2>

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
            className="rounded-control border border-rule bg-canvas px-3 py-2.5 text-body outline-none focus-visible:border-accent-ink"
          />
        </label>

        {outcome && outcome.kind !== 'revoked' ? (
          <p className="rounded-card border border-wait-line bg-wait-soft p-4 text-caption text-wait">
            <span className="font-medium">The mandate was not revoked.</span>{' '}
            {outcome.kind === 'refused' ? outcome.message : outcome.reason}
          </p>
        ) : null}

        {outcome?.kind === 'revoked' ? (
          <p className="rounded-card border border-ok-line bg-ok-soft p-4 text-caption text-ok">
            <span className="font-medium">Revoked.</span>{' '}
            <a
              className="link"
              href={EXPLORER.tx(outcome.digest).suiscan}
              target="_blank"
              rel="noreferrer"
            >
              View the transaction
            </a>
          </p>
        ) : null}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn--ghost h-10 px-5 text-label"
          >
            {outcome ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={typed !== eventName || sending || outcome?.kind === 'revoked'}
            onClick={confirm}
            className="btn btn--primary h-10 px-5 text-label"
          >
            {sending ? 'Revoking…' : 'Revoke this mandate'}
          </button>
        </div>
      </div>
    </div>
  );
}
