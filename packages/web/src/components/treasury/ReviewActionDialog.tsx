'use client';

import { useEffect, useRef, useState } from 'react';
import type { Claim, ClaimReviewAction } from '@tali/shared';

import { Money } from '../Money';
import { reviewDialogCopy, validateReviewReason } from '../../lib/review-actions';

interface Props {
  action: ClaimReviewAction;
  claim: Claim;
  pending: boolean;
  serverError: string | null;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}

export function ReviewActionDialog({
  action,
  claim,
  pending,
  serverError,
  onCancel,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const copy = reviewDialogCopy(action);
  const needsReason = action !== 'approve';

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  function confirm() {
    const error = validateReviewReason(action, reason);
    setValidationError(error);
    if (error) return;
    onConfirm(needsReason ? reason : undefined);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-action-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5"
    >
      <div className="flex w-full max-w-lg flex-col gap-5 rounded-modal border border-rule bg-surface p-6 shadow-float">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Treasurer decision</span>
          <h2 id="review-action-title" className="text-heading">
            {copy.title}
          </h2>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-card border border-rule bg-canvas p-4">
          <div className="min-w-0">
            <p className="truncate text-body font-medium">{claim.merchant}</p>
            <p className="text-caption text-ink-3">{claim.submitterName}</p>
          </div>
          <Money
            amount={claim.amount}
            unit={claim.analysis?.currency ?? 'USDC'}
            size="row"
            className="shrink-0"
          />
        </div>

        <p
          className={`rounded-card border p-4 text-caption ${
            action === 'approve'
              ? 'border-wait-line bg-wait-soft text-wait'
              : 'border-rule bg-raised text-ink-2'
          }`}
        >
          {copy.consequence}
        </p>

        {needsReason ? (
          <label className="flex flex-col gap-2">
            <span className="text-caption text-ink-2">Reason</span>
            <textarea
              ref={inputRef}
              value={reason}
              maxLength={501}
              rows={4}
              disabled={pending}
              onChange={(event) => {
                setReason(event.target.value);
                setValidationError(null);
              }}
              aria-describedby="review-reason-help"
              className="resize-none rounded-control border border-rule bg-canvas px-3 py-2.5 text-body outline-none focus-visible:border-accent-ink"
              placeholder={
                action === 'reject'
                  ? 'Explain why this expense cannot be reimbursed'
                  : 'Tell the member what needs to be corrected'
              }
            />
            <span id="review-reason-help" className="flex justify-between text-caption text-ink-3">
              <span>{validationError ?? 'Required · stored in the audit record'}</span>
              <span className="tnum">{reason.length}/500</span>
            </span>
          </label>
        ) : null}

        {serverError ? (
          <p className="rounded-control border border-no-line bg-no-soft p-3 text-caption text-no" role="alert">
            {serverError}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="btn btn--ghost h-10 px-5 text-label"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={confirm}
            className={`btn h-10 px-5 text-label ${
              action === 'reject' ? 'btn--danger' : 'btn--primary'
            }`}
          >
            {pending ? `${copy.confirmLabel}…` : copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
