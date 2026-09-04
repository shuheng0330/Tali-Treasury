'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { ClaimReviewAction, MandateView } from '@tali/shared';
import { Money } from '@/components/Money';
import { COMMITTED, event } from '@/lib/mock/data';
import { ClaimStatusSummary } from '../claim/ClaimStatusSummary';
import { FxQuoteSummary } from '../claim/FxQuoteSummary';
import { DEMO_EVENT_NAME, DEMO_TREASURER, SINGLE_WALLET_DEMO } from '@/lib/demo-config';
import { reviewQueue, settledClaims } from '@/lib/mock/api';
import { committedFrom, settledFrom, toReviewQueue } from '@/lib/queue';
import { useClaims } from '@/lib/api/useClaims';
import { tryPayClaim, tryProcessClaim, tryReviewClaim } from '@/lib/api/demo';
import { reconcileClaim, TaliApiError } from '@/lib/api/client';
import { pollPaymentReconciliation } from '@/lib/api/reconciliation';
import { DataNotice } from '@/components/DataNotice';
import { ClaimRow } from './ClaimRow';
import { MandateHeader } from './MandateHeader';
import { RevokeDialog } from './RevokeDialog';
import { ReviewActionDialog } from './ReviewActionDialog';
import { PaymentReconciliationStatus } from './PaymentReconciliationStatus';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { reviewRequestForClaim } from '@/lib/review-actions';

type Tab = 'review' | 'paid' | 'rejected' | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'review', label: 'Needs review' },
  { id: 'paid', label: 'Paid' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

interface Props {
  apiEnabled: boolean;
  /** False when the review columns are missing, which no write can work
   *  around. The controls say so rather than failing on the click. */
  reviewsRecordable: boolean;
  initialMandate: MandateView | null;
  readError?: string;
}

export function TreasuryDashboard({
  apiEnabled,
  reviewsRecordable,
  initialMandate: mandate,
  readError,
}: Props) {
  const wallet = useWalletSession();
  const authenticated = apiEnabled && wallet.status === 'authenticated';
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [tab, setTab] = useState<Tab>('review');
  const [confirming, setConfirming] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  /* Holds a whole sentence rather than a fragment. Three different operations
     write here, and a fixed lead-in around it named the wrong one for two of
     them — a refused transfer read as a failed evaluation. */
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{
    claimId: string;
    action: ClaimReviewAction;
  } | null>(null);
  const [reviewPending, setReviewPending] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [reconciliationNotice, setReconciliationNotice] = useState<string | null>(null);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [refreshingPayments, setRefreshingPayments] = useState(false);

  const live = useClaims(apiEnabled, wallet.address ?? DEMO_TREASURER);

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

  /* Approved and in-flight claims are spoken for. The mandate's remaining
     budget still counts them as available, so subtracting them here is what
     stops the header inviting an approval the money cannot cover. */
  const committed = useMemo(
    /* The sample evaluator measures the budget against COMMITTED, so the header
       has to use the same figure or it contradicts the rows underneath it. */
    () => (live.source === 'live' ? committedFrom(live.claims) : COMMITTED),
    [live.source, live.claims],
  );

  const rejected = everything.filter((claim) => claim.state === 'rejected');
  const history = tab === 'paid' ? paid : tab === 'rejected' ? rejected : everything;
  const counts = {
    review: queue.length,
    paid: paid.length,
    rejected: rejected.length,
    all: everything.length,
  };
  const reviewingClaim = reviewing
    ? everything.find((claim) => claim.id === reviewing.claimId) ?? null
    : null;

  /* A write moves money or the mandate itself, and both are read on the
     server. Reloading only the claims would leave the budget above them
     stale. */
  function reloadEverything() {
    live.reload();
    startRefresh(() => router.refresh());
  }

  async function process(id: string) {
    if (!authenticated) {
      setActionError('Sign in with the event treasurer wallet first.');
      return;
    }
    setProcessingId(id);
    setActionError(null);
    const result = await tryProcessClaim(id);
    setProcessingId(null);
    if (result.data === null) {
      setActionError(
        `Could not evaluate the claim: ${result.reason ?? 'claim processing failed'}.`,
      );
      return;
    }
    /* Evaluating is not read-only: an auto_pay verdict signs and submits in
       the same request, so a refusal has to be said out loud rather than left
       looking like a successful evaluation. */
    if (result.data.payment && !result.data.payment.ok) {
      setActionError(`The claim was evaluated, but nothing was paid: ${result.data.payment.message}`);
    }
    reloadEverything();
  }

  async function pay(id: string) {
    setPayingId(id);
    setActionError(null);
    const result = await tryPayClaim(id);
    setPayingId(null);
    if (result.data === null) {
      setActionError(
        `The payment did not complete: ${result.reason ?? 'the transfer was refused'}.`,
      );
      return;
    }
    if (!result.data.payment.ok) {
      setActionError(`Nothing was paid: ${result.data.payment.message}`);
    }
    reloadEverything();
  }

  function openReview(claimId: string, action: ClaimReviewAction) {
    if (!authenticated) {
      setReviewError('Sign in with the event treasurer wallet first.');
      return;
    }
    setReviewError(null);
    setReviewing({ claimId, action });
  }

  async function submitReview(reason?: string) {
    if (!reviewing || !reviewingClaim) return;
    setReviewPending(true);
    setReviewError(null);
    const request = reviewRequestForClaim(
      reviewingClaim,
      reviewing.action,
      reason,
    );
    const result = await tryReviewClaim(reviewing.claimId, request);
    setReviewPending(false);
    if (result.data === null) {
      setReviewError(result.reason ?? 'The review action could not be completed.');
      return;
    }
    if (!result.data.recorded) {
      /* Somebody decided first. Their decision stands, and saying nothing here
         would let this treasurer believe theirs did. */
      setReviewError('Another treasurer decided this claim first. Their decision stands.');
      reloadEverything();
      return;
    }
    setReviewing(null);
    reloadEverything();
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
    /* The revoke dialog outlives this branch on purpose. Revoking triggers a
       re-read, and a re-read that fails would otherwise replace the dialog —
       and the only link to the transaction that just revoked — with this. */
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
        {confirming ? (
          <RevokeDialog
            eventName={event.name}
            remaining="0"
            pendingCount={0}
            onCancel={() => setConfirming(false)}
            onRevoked={reloadEverything}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-8">
      {SINGLE_WALLET_DEMO ? (
        <p className="text-body text-ink-2">
          Single-wallet Testnet demo: the same person submits and reviews claims.
          This demonstrates the workflow, not separation of duties. Payments use test tokens.
        </p>
      ) : null}
      <MandateHeader
        eventName={DEMO_EVENT_NAME}
        organisation={event.organisation}
        mandate={mandate}
        committed={committed}
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
        <div className="flex flex-col gap-3 border-b border-rule p-4 empty:hidden">
          {/* Silent when the queue is live: the "Live from Sui Testnet" card
              above and a populated, working queue below already say so. This
              box only needs to speak up when something fell back, which is
              the one time a treasurer needs to know. */}
          {live.source !== 'live' ? (
            <DataNotice
              source={live.source}
              reason={live.reason}
              live="Claim loading, policy decisions, and review actions"
              plural
              simulated="Reviewing and paying a claim need the live queue, so on sample data their controls do nothing."
            />
          ) : null}
          {live.source === 'live' && !reviewsRecordable ? (
            <p className="rounded-control border border-wait-line bg-wait-soft p-3 text-caption text-wait">
              A decision can&rsquo;t be recorded yet — apply migration{' '}
              <span className="font-mono">20260901020000_claim_review_actions.sql</span>.
              Evaluating, paying and reconciling still work.
            </p>
          ) : null}
          {actionError ? (
            <p className="rounded-control border border-no-line bg-no-soft p-3 text-caption text-no" role="alert">
              {actionError}
            </p>
          ) : null}
          {reconciliationNotice ? (
            <p className="rounded-control border border-wait-line bg-wait-soft p-3 text-caption text-ink-2" role="status">
              {reconciliationNotice}
            </p>
          ) : null}
          {reconciliationError ? (
            <p className="rounded-control border border-no-line bg-no-soft p-3 text-caption text-no" role="alert">
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
              aria-pressed={tab === entry.id}
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
                  onPay={pay}
                  onCheckPayment={checkPayment}
                  paying={payingId === item.claim.id}
                  reconciling={reconcilingId === item.claim.id}
                  actionsDisabled={!authenticated}
                  disabledReason="Sign in with the event treasurer wallet first"
                  reviewsBlocked={!reviewsRecordable}
                  reviewsBlockedReason="The database cannot store a decision yet"
                />
              ))}
            </ul>
          )
        ) : null}

        {tab !== 'review' ? (
          <ul className="flex flex-col divide-y divide-rule">
            {history.length === 0 ? (
              <li className="px-6 py-10 text-center text-body text-ink-2">
                {tab === 'rejected' ? 'No rejected claims.' : tab === 'paid' ? 'No payments yet.' : 'No claims yet.'}
              </li>
            ) : null}
            {history.map((claim) => (
              <li key={claim.id} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="break-words text-body font-medium">{claim.merchant}</span>
                  <Money amount={claim.amount} unit={claim.analysis?.currency ?? 'USDC'} size="row" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <ClaimStatusSummary claim={claim} />
                  <span className="text-body text-ink-3">{claim.submitterName}</span>
                  <FxQuoteSummary claim={claim} />
                </div>
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
          eventName={DEMO_EVENT_NAME}
          remaining={mandate.remainingBudget}
          pendingCount={queue.length}
          onCancel={() => setConfirming(false)}
          onRevoked={reloadEverything}
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
