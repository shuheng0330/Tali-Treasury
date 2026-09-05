import type { LeaveRequest } from '@tali/shared';
import { LEAVE_KIND_LABEL, approvedLeaveDeduction, toDisplay } from '@tali/shared';

import { byNewestLeave, formatLeaveRange } from '@/lib/leave-form';
import { Money } from '@/components/Money';
import { LeaveStatusChip } from './LeaveStatusChip';

export function LeaveList({
  requests,
  loading,
}: {
  requests: readonly LeaveRequest[];
  loading: boolean;
}) {
  const deducted = approvedLeaveDeduction(requests);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="eyebrow">Your leave</h2>
        {BigInt(deducted) > 0n ? (
          <span className="text-caption text-ink-2">
            <span className="tnum font-medium">{toDisplay(deducted)} MYR</span> comes off the
            next run
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="rounded-card border border-dashed border-rule px-4 py-8 text-center text-caption text-ink-3">
          Loading your leave…
        </p>
      ) : requests.length === 0 ? (
        <p className="rounded-card border border-dashed border-rule px-4 py-8 text-center text-caption text-ink-3">
          Nothing yet. Ask for a day off and it lands here.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-card border border-rule bg-surface">
          {byNewestLeave(requests).map((request) => (
            <li key={request.id} className="flex flex-col gap-3 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="tnum text-body font-medium">
                    {formatLeaveRange(request.startOn, request.endOn)}
                  </span>
                  <span className="text-caption text-ink-3">
                    {LEAVE_KIND_LABEL[request.kind]} · <span className="tnum">{request.days}</span>{' '}
                    {request.days === '1' ? 'day' : 'days'}
                  </span>
                </span>
                {BigInt(request.deduction) > 0n ? (
                  <Money amount={request.deduction} unit="MYR" size="row" />
                ) : (
                  <span className="text-caption text-ink-3">No deduction</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <LeaveStatusChip status={request.status} />
              </div>

              {request.reason ? (
                <p className="text-caption text-ink-2">{request.reason}</p>
              ) : null}

              {request.decisionReason ? (
                <p
                  className={`rounded-control border p-3 text-caption ${
                    request.status === 'rejected'
                      ? 'border-no-line bg-no-soft text-no'
                      : 'border-rule bg-raised text-ink-2'
                  }`}
                >
                  <span className="font-medium">
                    {request.status === 'rejected'
                      ? 'The employer said no.'
                      : 'The employer said:'}
                  </span>{' '}
                  <span className="text-ink-2">{request.decisionReason}</span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
