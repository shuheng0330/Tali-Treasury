'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  DraftClaim,
  MandateView,
  PaymentResult,
  PolicyDecision,
  ReceiptAnalysis,
} from '@tali/shared';
import { event, mandate as sampleMandate } from '@/lib/mock/data';
import { evaluate, pay } from '@/lib/mock/api';
import { analyzeReceipt, createClaim, type Source } from '@/lib/api/client';
import { useClaims } from '@/lib/api/useClaims';
import { DEMO_EVENT_ID, DEMO_VIEWER } from '@/lib/config';
import { DataNotice } from '@/components/DataNotice';
import { ClaimHome } from './ClaimHome';
import { ReceiptConfirm } from './ReceiptConfirm';
import { RuleCheck } from './RuleCheck';
import { Held, Paid } from './Outcome';

type Step = 'home' | 'reading' | 'confirm' | 'checking' | 'paid' | 'held';

function Reading({ photoUrl }: { photoUrl: string }) {
  return (
    <div className="flex flex-col items-center gap-5 pt-6">
      <div className="relative w-full overflow-hidden rounded-card border border-rule bg-raised">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="The receipt you photographed" className="max-h-64 w-full object-contain" />
        <span className="absolute inset-0 animate-breathe bg-accent/10" aria-hidden />
      </div>
      <p className="text-subhead text-ink-2" aria-live="polite">
        Reading your receipt…
      </p>
    </div>
  );
}

export function ClaimFlow({ mandate }: { mandate: MandateView | null }) {
  const [step, setStep] = useState<Step>('home');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ReceiptAnalysis | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftClaim | null>(null);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [payment, setPayment] = useState<PaymentResult | null>(null);

  /** Where this receipt's analysis came from, which decides whether the claim
   *  can be persisted: without a live read there is no uploaded image, so the
   *  storage path the API insists on does not exist. */
  const [source, setSource] = useState<Source>('mock');
  const [notice, setNotice] = useState<string | null>(null);

  /** Kept apart from `source`, because a claim that failed to save says nothing
   *  about whether the receipt was read — conflating them had the banner
   *  blaming the analyser for a database refusal. */
  const [saveError, setSaveError] = useState<string | null>(null);

  const { claims: allClaims, source: claimsSource, reason: claimsReason, reload } = useClaims();

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

    analyzeReceipt(file).then((result) => {
      setAnalysis(result.data?.analysis ?? null);
      setStoragePath(result.data?.storagePath || null);
      setDuplicateOf(result.data?.duplicateOf ?? null);
      setSource(result.source);
      setNotice(result.reason);
      setStep('confirm');
    });
  }, []);

  const onSubmit = useCallback(
    (next: DraftClaim) => {
      setDraft(next);
      setDecision(evaluate(next, budget, chainLive ? '0' : undefined));
      setStep('checking');

      if (source !== 'live' || analysis === null || storagePath === null) {
        setSaveError('This claim was not saved: the receipt was never uploaded.');
        return;
      }

      setSaveError(null);
      createClaim({
        eventId: DEMO_EVENT_ID,
        submitter: DEMO_VIEWER,
        amount: next.amount,
        merchant: next.merchant,
        receiptDate: next.receiptDate,
        category: next.category,
        description: next.description,
        storagePath,
        analysis,
      }).then((created) => {
        if (created.data !== null) {
          reload();
          return;
        }
        setSaveError(`This claim was not saved: ${created.reason}.`);
      });
    },
    [source, analysis, storagePath, reload, budget, chainLive],
  );

  const onSettled = useCallback(() => {
    if (!decision || !draft) return;

    if (decision.outcome === 'auto_pay') {
      pay(draft.amount).then((result) => {
        setPayment(result);
        setStep('paid');
      });
      return;
    }

    setStep('held');
  }, [decision, draft]);

  const reset = useCallback(() => {
    setAnalysis(null);
    setStoragePath(null);
    setDuplicateOf(null);
    setDraft(null);
    setDecision(null);
    setPayment(null);
    setSource('mock');
    setNotice(null);
    setSaveError(null);
    setStep('home');
  }, []);

  const mine = allClaims.filter((claim) => claim.submitter === DEMO_VIEWER);

  const home = step === 'home';
  const homeLive = claimsSource === 'live' && chainLive;
  const homeReason = chainLive ? claimsReason : 'the mandate could not be read from Sui';
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
            simulated="Policy, payment and wallet signing still run locally — nothing is signed or broadcast."
          />
        </div>
      )}

      {home ? (
        <ClaimHome
          eventName={event.name}
          available={budget.remainingBudget}
          budget={budget.initialBudget}
          claims={mine}
          onCapture={onCapture}
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

      {step === 'checking' && decision ? (
        <RuleCheck decision={decision} onSettled={onSettled} />
      ) : null}

      {step === 'paid' && draft && payment ? (
        <Paid amount={draft.amount} payment={payment} saveError={saveError} onDone={reset} />
      ) : null}

      {step === 'held' && draft && decision ? (
        <Held amount={draft.amount} decision={decision} saveError={saveError} onDone={reset} />
      ) : null}
    </div>
  );
}
