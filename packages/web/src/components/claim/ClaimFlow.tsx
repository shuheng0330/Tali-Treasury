'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  Claim,
  DraftClaim,
  MandateView,
  ReceiptAnalysis,
} from '@tali/shared';
import { subtract } from '@tali/shared';
import { committedFrom } from '@/lib/queue';
import { mandate as sampleMandate } from '@/lib/mock/data';
import { tryAnalyzeReceipt, tryCreateClaim, type Source } from '@/lib/api/demo';
import { useClaims } from '@/lib/api/useClaims';
import { DEMO_EVENT_ID, DEMO_EVENT_NAME, DEMO_SUBMITTER } from '@/lib/demo-config';
import { DataNotice } from '@/components/DataNotice';
import { ClaimHome } from './ClaimHome';
import { ReceiptConfirm } from './ReceiptConfirm';
import { tryResubmitClaim } from '@/lib/api/resubmit';
import { Submitted } from './Outcome';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';

type Step = 'home' | 'reading' | 'confirm' | 'correcting' | 'submitting' | 'submitted';

interface Props {
  apiEnabled: boolean;
  mandate: MandateView | null;
  mandateReadError?: string;
}

function Reading({ photoUrl, message = 'Reading your receipt…' }: { photoUrl: string; message?: string }) {
  return (
    <div className="flex flex-col items-center gap-5 pt-6">
      <div className="relative w-full overflow-hidden rounded-card border border-rule bg-raised">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="The receipt you photographed" className="max-h-64 w-full object-contain" />
        <span className="absolute inset-0 animate-breathe bg-accent/10" aria-hidden />
      </div>
      <p className="text-subhead text-ink-2" aria-live="polite">
        {message}
      </p>
    </div>
  );
}

export function ClaimFlow({ apiEnabled, mandate, mandateReadError }: Props) {
  const wallet = useWalletSession();
  const authenticated = apiEnabled && wallet.status === 'authenticated';
  const [step, setStep] = useState<Step>('home');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ReceiptAnalysis | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftExpiresAt, setDraftExpiresAt] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [submittedClaim, setSubmittedClaim] = useState<Claim | null>(null);
  const [correcting, setCorrecting] = useState<Claim | null>(null);

  /** Where this receipt's analysis came from, which decides whether the claim
   *  can be persisted: without a live read there is no uploaded image, so the
   *  storage path the API insists on does not exist. */
  const [source, setSource] = useState<Source>('mock');
  const [notice, setNotice] = useState<string | null>(null);

  /** Kept apart from `source`, because a claim that failed to save says nothing
   *  about whether the receipt was read — conflating them had the banner
   *  blaming the analyser for a database refusal. */
  const [saveError, setSaveError] = useState<string | null>(null);

  const claims = useClaims(apiEnabled);
  const reloadClaims = claims.reload;

  /** The chain is the authority on the budget. Falling back to the sample
   *  mandate keeps the screen usable when the RPC is down, and the banner says
   *  which one is on screen. */
  const chainLive = mandate !== null;
  const budget = mandate ?? sampleMandate;

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const onCapture = useCallback((file: File) => {
    setPhotoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
    setStep('reading');
    setSaveError(null);

    tryAnalyzeReceipt(file).then((result) => {
      setAnalysis(result.data?.analysis ?? null);
      setDraftId(result.data?.draftId ?? null);
      setDraftExpiresAt(result.data?.draftExpiresAt ?? null);
      setDuplicateOf(result.data?.duplicateOf ?? null);
      setSource(result.source);
      setNotice(result.reason);
      setStep('confirm');
    });
  }, []);

  const onSubmit = useCallback(
    async (next: DraftClaim) => {
      if (source !== 'live' || analysis === null || draftId === null) {
        setSaveError('This claim was not saved: the receipt was never uploaded.');
        return;
      }
      if (draftExpiresAt && Date.parse(draftExpiresAt) <= Date.now()) {
        setSaveError('This receipt analysis expired. Analyze again before submitting.');
        return;
      }

      setSaveError(null);
      setStep('submitting');
      const created = await tryCreateClaim({
        draftId,
        amount: next.amount,
        merchant: next.merchant.trim(),
        receiptDate: next.receiptDate,
        category: next.category,
        description: next.description.trim(),
      });
      if (created.data === null) {
        setSaveError(`This claim was not saved: ${created.reason}.`);
        setStep('confirm');
        return;
      }
      setSubmittedClaim(created.data.claim);
      reloadClaims();
      setStep('submitted');
    },
    [source, analysis, draftId, draftExpiresAt, reloadClaims],
  );

  const onCorrect = useCallback((claim: Claim) => {
    setCorrecting(claim);
    setSaveError(null);
    setStep('correcting');
  }, []);

  const onResubmit = useCallback(
    async (next: DraftClaim) => {
      if (correcting === null) return;

      setSaveError(null);
      setStep('submitting');
      const saved = await tryResubmitClaim({
        claimId: correcting.id,
        merchant: next.merchant.trim(),
        amount: next.amount,
        receiptDate: next.receiptDate,
        category: next.category,
        description: next.description.trim(),
      });
      if (saved.data === null) {
        setSaveError(`This correction was not saved: ${saved.reason}.`);
        setStep('correcting');
        return;
      }
      if (!saved.data.accepted) {
        /* The treasurer moved the claim on between the read and the write, so
           the correction no longer applies. Showing "Claim submitted" here
           would tell the member their fix landed when it was discarded. */
        setSaveError(
          'This correction was not saved: the treasurer had already moved the claim on.',
        );
        reloadClaims();
        setStep('correcting');
        return;
      }
      setSubmittedClaim(saved.data.claim);
      setCorrecting(null);
      reloadClaims();
      setStep('submitted');
    },
    [correcting, reloadClaims],
  );

  const reset = useCallback(() => {
    setPhotoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setAnalysis(null);
    setCorrecting(null);
    setDraftId(null);
    setDraftExpiresAt(null);
    setDuplicateOf(null);
    setSubmittedClaim(null);
    setSource('mock');
    setNotice(null);
    setSaveError(null);
    setStep('home');
  }, []);

  const mine = claims.claims.filter((claim) =>
    wallet.address
      ? claim.submitter.toLowerCase() === wallet.address.toLowerCase()
      : claim.submitter.toLowerCase() === DEMO_SUBMITTER.toLowerCase(),
  );

  /* The same subtraction the treasurer's header makes. Claims already approved
     are spoken for, and showing the member a larger figure than the treasurer
     sees would invite a receipt the budget cannot cover. */
  const available =
    claims.source === 'live'
      ? subtract(budget.remainingBudget, committedFrom(claims.claims))
      : budget.remainingBudget;

  const home = step === 'home';
  const homeLive = claims.source === 'live' && chainLive;
  const chainReason = mandateReadError
    ? `the mandate could not be read from Sui (${mandateReadError})`
    : 'the mandate could not be read from Sui';
  const homeReason = chainLive ? claims.reason : chainReason;
  /** Name only what actually fell back. A live chain read with a dead claims
   *  API is not "your budget fell back". */
  const homeLabel =
    chainLive && !homeLive ? 'Your claim history' : 'Your budget and claim history';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 py-6">
      {step === 'reading' ? null : (
        <div className="mb-6">
          <DataNotice
            source={home ? (homeLive ? 'live' : 'mock') : source}
            reason={home ? homeReason : notice}
            live={home ? homeLabel : 'Receipt reading and storage'}
            plural={home && homeLabel.includes(' and ')}
            simulated="Policy and payment remain server-controlled; wallet authentication is live on Sui Testnet."
          />
        </div>
      )}

      {home ? (
        <ClaimHome
          eventName={DEMO_EVENT_NAME}
          available={available}
          budget={budget.initialBudget}
          claims={mine}
          claimsLoading={claims.loading}
          captureDisabled={!authenticated}
          onCapture={onCapture}
          onCorrect={onCorrect}
        />
      ) : null}

      {step === 'reading' && photoUrl ? <Reading photoUrl={photoUrl} /> : null}

      {step === 'confirm' && photoUrl ? (
        <ReceiptConfirm
          photoUrl={photoUrl}
          analysis={analysis}
          duplicateOf={duplicateOf}
          onRetake={reset}
          onSubmit={onSubmit}
        />
      ) : null}

      {step === 'correcting' && correcting ? (
        <ReceiptConfirm
          photoUrl={correcting.receiptUrl ?? ''}
          analysis={correcting.analysis}
          duplicateOf={null}
          returnedReason={correcting.review?.reason ?? null}
          initial={{
            merchant: correcting.merchant,
            amount: correcting.amount,
            receiptDate: correcting.receiptDate,
            category: correcting.category,
            description: correcting.description,
          }}
          submitLabel="Resubmit this claim"
          onRetake={reset}
          onSubmit={onResubmit}
        />
      ) : null}

      {step === 'submitting' ? (
        correcting === null && photoUrl ? (
          <Reading photoUrl={photoUrl} message="Submitting your claim…" />
        ) : (
          <p className="pt-6 text-center text-subhead text-ink-2" aria-live="polite">
            Sending your correction…
          </p>
        )
      ) : null}

      {step === 'submitted' && submittedClaim ? (
        <Submitted claim={submittedClaim} onDone={reset} />
      ) : null}
    </div>
  );
}
