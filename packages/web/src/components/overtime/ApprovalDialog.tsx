'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LEAVE_KIND_LABEL,
  OVERTIME_KIND_LABEL,
  OVERTIME_KIND_RATE,
} from '@tali/shared';

import { Money } from '../Money';
import { validateReviewReason } from '../../lib/review-actions';
import type { ApprovalItem, ReviewAction } from '../../lib/approval-summary';
import { CommitmentSummary, type Projection } from './CommitmentSummary';

interface Copy {
  title: string;
  consequence: string;
  confirmLabel: string;
}

function copyFor(item: ApprovalItem, action: ReviewAction): Copy {
  if (action === 'reject') {
    return item.kind === 'overtime'
      ? {
          title: 'Reject this overtime?',
          consequence:
            'The hours stay unpaid and your reason is recorded against the claim. The employee sees it on their own screen.',
          confirmLabel: 'Reject the claim',
        }
      : {
          title: 'Reject this leave?',
          consequence:
            'The days are not booked and your reason is recorded against the request.',
          confirmLabel: 'Reject the request',
        };
  }

  if (item.kind === 'leave') {
    return item.request.kind === 'unpaid'
      ? {
          title: 'Approve this unpaid leave?',
          consequence:
            'Nothing is paid now. Wages not payable are not wages under any of the three definitions, so this comes off the EPF, SOCSO and EIS bases alike when payroll next runs.',
          confirmLabel: 'Record the approval',
        }
      : {
          title: 'Approve this leave?',
          consequence:
            'Paid leave is ordinary wages, so the next run is unchanged. Nothing is paid now.',
          confirmLabel: 'Record the approval',
        };
  }

  return {
    title: 'Approve this overtime?',
    consequence:
      'Nothing is paid now. Approving raises the wage the next payroll run pays, and that run spends the mandate’s budget on chain.',
    confirmLabel: 'Record the approval',
  };
}

function warned(projection: Projection): boolean {
  if (projection.status !== 'ready') return false;
  const { epfAfter, spendAfter } = projection.commitment;
  return (
    epfAfter?.clears === false ||
    spendAfter?.withinBudget === false ||
    spendAfter?.withinPerRun === false
  );
}

interface Props {
  item: ApprovalItem;
  action: ReviewAction;
  projection: Projection;
  pending: boolean;
  serverError: string | null;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}

export function ApprovalDialog({
  item,
  action,
  projection,
  pending,
  serverError,
  onCancel,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const copy = copyFor(item, action);
  const needsReason = action === 'reject';

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  function confirm() {
    const error = needsReason ? validateReviewReason('reject', reason) : null;
    setValidationError(error);
    if (error) return;
    onConfirm(needsReason ? reason : undefined);
  }

  const heading =
    item.kind === 'overtime'
      ? `${OVERTIME_KIND_LABEL[item.claim.kind]} · ${OVERTIME_KIND_RATE[item.claim.kind]} · ${item.claim.hours}h`
      : `${LEAVE_KIND_LABEL[item.request.kind]} · ${item.request.days} days`;

  const when =
    item.kind === 'overtime'
      ? item.claim.workedOn
      : `${item.request.startOn} to ${item.request.endOn}`;

  const confirmLabel =
    action === 'approve' && warned(projection) ? 'Approve anyway' : copy.confirmLabel;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-action-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5"
    >
      <div className="flex max-h-[90dvh] w-full max-w-xl flex-col gap-5 overflow-y-auto rounded-modal border border-rule bg-surface p-6 shadow-float">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Employer decision</span>
          <h2 id="approval-action-title" className="text-heading">
            {copy.title}
          </h2>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-card border border-rule bg-canvas p-4">
          <div className="min-w-0">
            <p className="truncate text-body font-medium">{heading}</p>
            <p className="tnum text-caption text-ink-3">{when}</p>
          </div>
          <Money
            amount={item.kind === 'overtime' ? item.claim.pay : item.request.deduction}
            unit="MYR"
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

        {action === 'approve' ? <CommitmentSummary projection={projection} /> : null}

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
              aria-describedby="approval-reason-help"
              className="resize-none rounded-control border border-rule bg-canvas px-3 py-2.5 text-body outline-none focus-visible:border-accent-ink"
              placeholder={
                item.kind === 'overtime'
                  ? 'Tell them why these hours are not being paid'
                  : 'Tell them why these days cannot be booked'
              }
            />
            <span id="approval-reason-help" className="flex justify-between text-caption text-ink-3">
              <span>{validationError ?? 'Required · kept with the decision'}</span>
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
            {pending ? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
