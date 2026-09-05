'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { ClaimReviewAction, MandateView } from '@tali/shared';
import { event } from '@/lib/mock/data';
import {
  DEMO_EVENT_ID,
  DEMO_EVENT_NAME,
  DEMO_TREASURER,
} from '@/lib/demo-config';
import { viewerRoles } from '@/lib/viewer-role';
import { reviewQueue, settledClaims } from '@/lib/mock/api';
import { committedFrom, settledFrom, toReviewQueue } from '@/lib/queue';
import { useClaims } from '@/lib/api/useClaims';
import { tryPayClaim, tryProcessClaim, tryReviewClaim } from '@/lib/api/demo';
import { reconcileClaim, TaliApiError } from '@/lib/api/client';
import { pollPaymentReconciliation } from '@/lib/api/reconciliation';
import { DataNotice } from '@/components/DataNotice';
import { ClaimRow } from './ClaimRow';
import { ClaimHistoryCard } from './ClaimHistoryCard';
import { AddMemberForm } from './AddMemberForm';
import { MandateHeader } from './MandateHeader';
import { RevokeDialog } from './RevokeDialog';
import { ReviewActionDialog } from './ReviewActionDialog';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { RoleNotice } from '@/components/RoleNotice';
import { REVIEW_COPY, REVOKE_COPY, walletAccess } from '@/lib/wallet-access';
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
  /** Read from the event row, which is the authority the server checks. */
  eventTreasurer?: string | null;
}

export function TreasuryDashboard({
  apiEnabled,
  reviewsRecordable,
  initialMandate: mandate,
  readError,
  eventTreasurer,
}: Props) {
  const wallet = useWalletSession();
  const authenticated = apiEnabled && wallet.status === 'authenticated';

  /* Reviewing, paying and revoking all belong to the event treasurer, and every
     one of them was offered to anybody signed in — revoke to anybody at all.
     The server refuses all three, so this only decides whether the refusal
     arrives before the click or after it.

     Checked against the treasurer recorded on the event rather than through
     `viewerRole`: that is the authority the server reads, and it differs per
     event. `DEMO_TREASURER` is a build-time constant kept only as the fallback
     for an event that could not be read. */
  const treasurer = eventTreasurer?.trim() || DEMO_TREASURER;
  const reviewAccess = walletAccess(wallet.address, treasurer, REVIEW_COPY);
  const revokeAccess = walletAccess(wallet.address, treasurer, REVOKE_COPY);
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
    /* Only a real queue can say what is really spoken for. The mandate figures
       above come from the chain, so subtracting the sample constant from them
       produced an "available" that was neither real nor sample — a fabricated
       number under a real mandate id, which is what the sample rows below are
       labelled to avoid. When the queue is not live, nothing is known to be
       committed and the header reports the chain balance alone. */
    () => (live.source === 'live' ? committedFrom(live.claims) : '0'),
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
          Tali could not read the USDC mandate from Sui Testnet. No balance is shown until chain data is available.
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
    <div className="page-safe mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-8">
      <MandateHeader
        eventName={DEMO_EVENT_NAME}
        organisation={event.organisation}
        mandate={mandate}
        committed={committed}
        onRevoke={() => setConfirming(true)}
        canRevoke={revokeAccess.permitted}
        revokeNotice={revokeAccess.notice}
      />

      {/* The set, not the single label: a wallet that is both employer and
          treasurer is called Employer on its badge, and asking for that one
          word here would hide the roster from the person who holds it. */}
      {viewerRoles(wallet.address, { eventTreasurer }).has('treasurer') ? (
        <AddMemberForm eventId={DEMO_EVENT_ID} onAdded={() => live.reload()} />
      ) : null}

      {/* Navigation, not an action: the setup screen checks the wallet itself,
          and hiding the way there from everyone who has not signed in yet
          leaves no way to reach it at all. */}
      <Link href="/treasury/setup" className="link self-start text-caption">
        Create another expense treasury
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-ok-line bg-ok-soft px-4 py-3 sm:px-5">
        <div>
          <p className="text-body font-medium text-ok">Sui Testnet · Live</p>
          {/* The server formats this in its own timezone and the browser in the
              viewer's, so the two renders legitimately differ. */}
          <p className="text-caption text-ink-2" suppressHydrationWarning>
            Last refreshed {new Date(mandate.fetchedAtMs).toLocaleTimeString('en-GB')}
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing || refreshingPayments}
          onClick={refreshChainState}
          className="btn btn--ghost min-h-11 px-5 text-label"
        >
          {refreshing || refreshingPayments ? 'Refreshing…' : 'Refresh chain state'}
        </button>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 empty:hidden">
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
              simulated="Reviewing and paying claims requires live data. These actions are unavailable."
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
          <RoleNotice access={reviewAccess} />
        </div>
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-card border border-rule bg-surface p-2">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-pressed={tab === entry.id}
              className={`min-h-11 shrink-0 rounded-badge px-4 py-2 font-display text-label uppercase transition-colors duration-150 ${
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
            <div className="flex flex-col items-center gap-3 rounded-card border border-rule bg-surface px-6 py-14 text-center">
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
            <ul className="grid gap-4">
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
                  actionsDisabled={!authenticated || !reviewAccess.permitted}
                  disabledReason={
                    reviewAccess.notice ?? 'Sign in with the event treasurer wallet first'
                  }
                  reviewsBlocked={!reviewsRecordable}
                  reviewsBlockedReason="The database cannot store a decision yet"
                />
              ))}
            </ul>
          )
        ) : null}

        {tab !== 'review' ? (
          <ul className="grid gap-4">
            {history.length === 0 ? (
              <li className="rounded-card border border-rule bg-surface px-6 py-10 text-center text-body text-ink-2">
                {tab === 'rejected' ? 'No rejected claims.' : tab === 'paid' ? 'No payments yet.' : 'No claims yet.'}
              </li>
            ) : null}
            {history.map((claim) => (
              <ClaimHistoryCard
                key={claim.id}
                claim={claim}
                pending={reconcilingId === claim.id}
                onCheck={checkPayment}
              />
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
