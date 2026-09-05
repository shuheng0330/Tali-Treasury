import {
  LEAVE_KIND_LABEL,
  ORP_DAYS_PER_MONTH,
  NORMAL_HOURS_PER_DAY,
  OVERTIME_KIND_LABEL,
  OVERTIME_KIND_RATE,
  toDisplay,
} from '@tali/shared';

import { Money } from '../Money';
import { StatusChip } from '../StatusChip';
import type { ApprovalItem, ReviewAction } from '../../lib/approval-summary';

function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function relative(atMs: number): string {
  const minutes = Math.round((Date.now() - atMs) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

interface Props {
  item: ApprovalItem;
  onReview: (item: ApprovalItem, action: ReviewAction) => void;
  /** Which decision on this row is in flight, if either. */
  pendingAction: ReviewAction | null;
  /** Another row's decision is being written, so this one waits its turn. */
  busy: boolean;
  disabled: boolean;
  disabledReason?: string;
}

export function ApprovalRow({
  item,
  onReview,
  pendingAction,
  busy,
  disabled,
  disabledReason,
}: Props) {
  const record = item.kind === 'overtime' ? item.claim : item.request;
  const decided = record.status !== 'submitted';

  const heading =
    item.kind === 'overtime'
      ? `${OVERTIME_KIND_LABEL[item.claim.kind]} · ${OVERTIME_KIND_RATE[item.claim.kind]} · ${item.claim.hours}h`
      : `${LEAVE_KIND_LABEL[item.request.kind]} · ${item.request.days} ${
          item.request.days === '1' ? 'day' : 'days'
        }`;

  const when =
    item.kind === 'overtime'
      ? item.claim.workedOn
      : item.request.startOn === item.request.endOn
        ? item.request.startOn
        : `${item.request.startOn} to ${item.request.endOn}`;

  const changesGross = item.kind === 'overtime' || item.request.kind === 'unpaid';
  const effect = !changesGross
    ? 'No change to gross'
    : record.status === 'rejected'
      ? 'Not counted'
      : item.kind === 'overtime'
        ? decided
          ? 'Added to gross'
          : 'Adds to gross'
        : decided
          ? 'Taken off gross'
          : 'Comes off gross';

  /* The statutory arithmetic, written out. Section 60I(1A) fixes the 26, and
     section 60A the eight-hour day, so both are law rather than a house rule
     the employer could be asked to take on trust. */
  const working =
    item.kind === 'overtime'
      ? `RM ${toDisplay(item.claim.monthlyWage)} ÷ ${ORP_DAYS_PER_MONTH} days ÷ ${NORMAL_HOURS_PER_DAY} hours × ${
          OVERTIME_KIND_RATE[item.claim.kind]
        } × ${item.claim.hours}h`
      : item.request.kind === 'unpaid'
        ? `RM ${toDisplay(item.request.monthlyWage)} ÷ ${ORP_DAYS_PER_MONTH} days × ${item.request.days}`
        : 'Paid leave is ordinary wages. Nothing comes off the run.';

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-body font-medium">{heading}</span>
          <span className="tnum text-caption text-ink-2">{when}</span>
          <span className="text-caption text-ink-3">
            <span className="font-mono">{short(record.employee)}</span> · submitted{' '}
            {relative(record.createdAtMs)}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-caption text-ink-3">{effect}</span>
          <Money
            amount={item.kind === 'overtime' ? item.claim.pay : item.request.deduction}
            unit="MYR"
            size="row"
          />
          {decided ? <StatusChip status={record.status} /> : null}
        </div>
      </div>

      <p className="text-caption text-ink-3">{working}</p>

      {item.kind === 'overtime' ? (
        <p className="text-caption text-ink-3">
          SOCSO and EIS count this. EPF does not.
        </p>
      ) : null}

      {record.reason ? (
        <p className="text-body text-ink-2">&ldquo;{record.reason}&rdquo;</p>
      ) : null}

      {decided ? (
        <p className="text-caption text-ink-3">
          {record.decisionReason
            ? `Recorded: ${record.decisionReason}`
            : 'Recorded with no further note.'}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onReview(item, 'approve')}
            className="btn btn--primary h-9 px-5 text-label"
            title={disabled ? disabledReason : undefined}
          >
            {pendingAction === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onReview(item, 'reject')}
            className="btn btn--danger h-9 px-5 text-label"
            title={disabled ? disabledReason : undefined}
          >
            {pendingAction === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      )}
    </li>
  );
}
