'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { Claim, ClaimReviewAction, MandateView } from '@tali/shared';
import { CLAIM_CHIP } from '@tali/shared';
import { Money } from '@/components/Money';
import { StatusChip } from '@/components/StatusChip';
import { event } from '@/lib/mock/data';
import { reviewQueue, settledClaims } from '@/lib/mock/api';
import { settledFrom, toReviewQueue } from '@/lib/queue';
import { useClaims } from '@/lib/api/useClaims';
import { tryProcessClaim, tryReviewClaim } from '@/lib/api/demo';
import { reconcileClaim, TaliApiError } from '@/lib/api/client';
import { pollPaymentReconciliation } from '@/lib/api/reconciliation';
import { DataNotice } from '@/components/DataNotice';
import { ClaimRow } from './ClaimRow';
import { MandateHeader } from './MandateHeader';
import { RevokeDialog } from './RevokeDialog';
import { ReviewActionDialog } from './ReviewActionDialog';
import { PaymentReconciliationStatus } from './PaymentReconciliationStatus';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { FxQuoteSummary } from '../claim/FxQuoteSummary';

type Tab = 'review' | 'paid' | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'review', label: 'Needs review' },
  { id: 'paid', label: 'Auto-paid' },
  { id: 'all', label: 'All' },
];

interface Props {
  apiEnabled: boolean;
  initialMandate: MandateView | null;
  readError?: string;
}

const NO_COMMITTED_CLAIMS = '0';

export function TreasuryDashboard({ apiEnabled, initialMandate: mandate, readError }: Props) {
  const wallet = useWalletSession();
  const authenticated = apiEnabled && wallet.status === 'authenticated';
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [tab, setTab] = useState<Tab>('review');
  const [confirming, setConfirming] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{
    claimId: string;
    action: ClaimReviewAction;
    snapshot: Claim;
  } | null>(null);
  const [reviewPending, setReviewPending] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [reconciliationNotice, setReconciliationNotice] = useState<string | null>(null);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [refreshingPayments, setRefreshingPayments] = useState(false);

  const live = useClaims(authenticated);

  const queue = useMemo(
    () =>
      live.source === 'live' && mandate !== null
        ? toReviewQueue(live.claims)
        : reviewQueue(),
    [live.source, live.claims, mandate],
  );

  const paid = useMemo(
    () => (live.source === 'live' ? settledFrom(live.claims) : settledClaims()),
    [live.source, live.claims],
  );

  const everything = useMemo(
    () =>
      live.source === 'live'
        ? live.claims
        : [...reviewQueue().map((item) => item.claim), ...settledClaims()],
    [live.source, live.claims],
  );

  const counts = { review: queue.length, paid: paid.length, all: everything.length };
  const reviewingClaim = reviewing?.snapshot ?? null;

  async function process(id: string) {
    if (!authenticated) {
      setProcessError('sign in with the event treasurer wallet first');
      return;
    }
    setProcessingId(id);
    setProcessError(null);
    const result = await tryProcessClaim(id);
    setProcessingId(null);
    if (result.data === null) {
      setProcessError(result.reason ?? 'claim processing failed');
      return;
    }
    live.reload();
  }

  function openReview(claimId: string, action: ClaimReviewAction) {
    if (!authenticated) {
      setReviewError('Sign in with the event treasurer wallet first.');
      return;
    }
    setReviewError(null);
    const snapshot = everything.find(claim => claim.id === claimId);
    if (snapshot) setReviewing({ claimId, action, snapshot });
  }

  async function submitReview(reason?: string) {
    if (!reviewing) return;
    setReviewPending(true);
    setReviewError(null);
    const request =
      reviewing.action === 'approve'
        ? { action: 'approve' as const, ...(reviewingClaim?.fxQuote ? { quoteId: reviewingClaim.fxQuote.id } : {}) }
        : { action: reviewing.action, reason: reason ?? '' };
    const result = await tryReviewClaim(reviewing.claimId, request);
    setReviewPending(false);
    if (result.data === null) {
      setReviewError(result.reason ?? 'The review action could not be completed.');
      return;
    }
    setReviewing(null);
    live.reload();
    if (result.data.payment !== null) {
      startRefresh(() => router.refresh());
    }
  }

  function safeReconciliationMessage(error: unknown) {
    return error instanceof TaliApiError
      ? error.message
      : 'Payment status could not be confirmed. No second payment was submitted.';
  }

  async function checkPayment(claimId: string) {
    setReconcilingId(claimId);
    setReconciliationError(null);
    setReconciliationNotice('Checking the stored transaction digest on Sui Testnet…');
    try {
      const result = await pollPaymentReconciliation(() => reconcileClaim(claimId));
      if (result.status === 'pending') {
        setReconciliationNotice(
          'The transaction is still pending or not yet visible. Tali did not sign or submit another payment.',
        );
      } else {
        setReconciliationNotice(
          result.status === 'paid'
            ? 'Payment confirmed on Sui Testnet.'
            : 'Sui confirmed that the payment was rejected.',
        );
        startRefresh(() => router.refresh());
      }
      live.reload();
    } catch (error) {
      setReconciliationNotice(null);
      setReconciliationError(safeReconciliationMessage(error));
    } finally {
      setReconcilingId(null);
    }
  }

  async function refreshChainState() {
    setRefreshingPayments(true);
    setReconciliationError(null);
    const payingClaims =
      live.source === 'live'
        ? live.claims.filter((claim) => claim.state === 'paying' && claim.paymentAttempt)
        : [];
    try {
      await Promise.all(payingClaims.map((claim) => reconcileClaim(claim.id)));
      live.reload();
      startRefresh(() => router.refresh());
    } catch (error) {
      setReconciliationError(safeReconciliationMessage(error));
    } finally {
      setRefreshingPayments(false);
    }
  }

  if (mandate === null) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-5 py-8">
        <h1 className="text-heading">Treasury unavailable</h1>
        <p className="text-body text-ink-2">
          Tali could not read the USDC mandate from Sui Testnet. No mock chain balance was substituted.
        </p>
        <p className="break-all rounded-card border border-rule bg-surface p-4 font-mono text-caption text-ink-2">
          {readError ?? 'Unknown Sui read error'}
        </p>
        <button type="button" onClick={() => router.refresh()} className="btn btn--primary w-fit">
          Retry live read
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-8">
      <MandateHeader
        eventName={event.name}
        organisation={event.organisation}
        mandate={mandate}
        committed={NO_COMMITTED_CLAIMS}
        onRevoke={() => setConfirming(true)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-ok-line bg-ok-soft px-4 py-3 sm:px-6">
        <div>
          <p className="text-body font-medium text-ok">Live from Sui Testnet</p>
          {/* The server formats this in its own timezone and the browser in the
              viewer's, so the two renders legitimately differ. */}
          <p className="text-caption text-ink-2" suppressHydrationWarning>
            Read at {new Date(mandate.fetchedAtMs).toLocaleTimeString('en-GB')} · Circle Testnet USDC
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing || refreshingPayments}
          onClick={refreshChainState}
          className="btn btn--ghost h-10 px-5 text-label"
        >
          {refreshing || refreshingPayments ? 'Refreshing…' : 'Refresh chain state'}
        </button>
      </div>

      <section className="flex flex-col overflow-hidden rounded-panel border border-rule bg-surface">
        <div className="border-b border-rule p-4">
          <DataNotice
            source={live.source}
            reason={live.reason}
            live="Claim loading, policy decisions, and review actions"
            plural
            simulated="Mandate revocation remains an explicitly labelled preview."
          />
          {processError ? (
            <p className="mt-3 rounded-control border border-no-line bg-no-soft p-3 text-caption text-no" role="alert">
              Could not evaluate the claim: {processError}.
            </p>
          ) : null}
          {reconciliationNotice ? (
            <p className="mt-3 rounded-control border border-wait-line bg-wait-soft p-3 text-caption text-ink-2" role="status">
              {reconciliationNotice}
            </p>
          ) : null}
          {reconciliationError ? (
            <p className="mt-3 rounded-control border border-no-line bg-no-soft p-3 text-caption text-no" role="alert">
              Reconciliation failed: {reconciliationError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-rule px-3 py-2">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={`rounded-badge px-4 py-2 font-display text-label uppercase transition-colors duration-150 ${
                tab === entry.id ? 'bg-ink text-canvas' : 'text-ink-3 hover:bg-raised hover:text-ink'
              }`}
            >
              {entry.label}
              <span className="tnum ml-2 opacity-60">{counts[entry.id]}</span>
            </button>
          ))}
        </div>

        {tab === 'review' ? (
          queue.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span className="text-heading text-ok" aria-hidden>
                ✓
              </span>
              <p className="text-subhead">Nothing needs you</p>
              <p className="max-w-sm text-caption text-ink-3">
                {paid.length === 0
                  ? 'No claim from this mandate is waiting on you.'
                  : `${paid.length} settled, none waiting on you.`}
              </p>
              <Link
                href="/safety"
                className="btn btn--ghost mt-2"
              >
                Run a safety test
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-rule">
              {queue.map((item) => (
                <ClaimRow
                  key={item.claim.id}
                  item={item}
                  processing={processingId === item.claim.id}
                  pendingAction={
                    reviewing?.claimId === item.claim.id && reviewPending
                      ? reviewing.action
                      : null
                  }
                  onProcess={process}
                  onReview={openReview}
                  actionsDisabled={!authenticated}
                />
              ))}
            </ul>
          )
        ) : null}

        {tab !== 'review' ? (
          <ul className="flex flex-col divide-y divide-rule">
            {(tab === 'paid' ? paid : everything).map((claim) => (
              <li key={claim.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-body">{claim.merchant}</span>
                  <FxQuoteSummary claim={claim} />
                  <span className="flex items-center gap-2">
                    <StatusChip status={CLAIM_CHIP[claim.state]} />
                    <span className="text-caption text-ink-3">{claim.submitterName}</span>
                  </span>
                </div>
                <Money amount={claim.amount} unit={claim.analysis?.currency ?? 'USDC'} size="row" />
                <PaymentReconciliationStatus
                  claim={claim}
                  pending={reconcilingId === claim.id}
                  onCheck={checkPayment}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {confirming ? (
        <RevokeDialog
          eventName={event.name}
          remaining={mandate.remainingBudget}
          pendingCount={queue.length}
          onCancel={() => setConfirming(false)}
          onConfirm={() => setConfirming(false)}
        />
      ) : null}

      {reviewing && reviewingClaim ? (
        <ReviewActionDialog
          action={reviewing.action}
          claim={reviewingClaim}
          pending={reviewPending}
          serverError={reviewError}
          onCancel={() => {
            if (!reviewPending) setReviewing(null);
          }}
          onConfirm={submitReview}
        />
      ) : null}
    </div>
  );
}
