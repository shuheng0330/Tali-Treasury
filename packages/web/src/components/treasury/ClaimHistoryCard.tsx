import type { Claim } from '@tali/shared';

import { Money } from '@/components/Money';
import { ClaimStatusSummary } from '../claim/ClaimStatusSummary';
import { FxQuoteSummary } from '../claim/FxQuoteSummary';
import { PaymentReconciliationStatus } from './PaymentReconciliationStatus';

function relativeTime(atMs: number) {
  const minutes = Math.max(0, Math.round((Date.now() - atMs) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ClaimHistoryCard({
  claim,
  pending,
  onCheck,
}: {
  claim: Claim;
  pending: boolean;
  onCheck: (claimId: string) => void;
}) {
  return (
    <li data-claim-card="true" className="flex min-w-0 flex-col gap-4 rounded-card border border-rule bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="break-words text-body-lg font-medium">{claim.merchant}</h3>
          <p className="mt-1 text-caption text-ink-3">
            {claim.submitterName} · <span className="capitalize">{claim.category}</span> ·{' '}
            <span suppressHydrationWarning>{relativeTime(claim.createdAtMs)}</span>
          </p>
        </div>
        <Money
          amount={claim.amount}
          unit={claim.analysis?.currency ?? 'USDC'}
          size="row"
          className="shrink-0"
        />
      </div>

      <ClaimStatusSummary claim={claim} structured />
      <FxQuoteSummary claim={claim} variant="compact" />
      <PaymentReconciliationStatus claim={claim} pending={pending} onCheck={onCheck} />
    </li>
  );
}
