'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DraftClaim, PaymentResult, PolicyDecision, ReceiptAnalysis } from '@tali/shared';
import { subtract } from '@tali/shared';
import { COMMITTED, event, mandate } from '@/lib/mock/data';
import { analyzeReceipt, evaluate, pay, recentClaims } from '@/lib/mock/api';
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

export function ClaimFlow() {
  const [step, setStep] = useState<Step>('home');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ReceiptAnalysis | null>(null);
  const [draft, setDraft] = useState<DraftClaim | null>(null);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [payment, setPayment] = useState<PaymentResult | null>(null);

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

    analyzeReceipt().then((result) => {
      setAnalysis(result);
      setStep('confirm');
    });
  }, []);

  const onSubmit = useCallback((next: DraftClaim) => {
    setDraft(next);
    setDecision(evaluate(next));
    setStep('checking');
  }, []);

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
    setDraft(null);
    setDecision(null);
    setPayment(null);
    setStep('home');
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 py-6">
      <p className="mb-6 rounded-card border border-wait-line bg-wait-soft p-4 text-caption text-wait">
        Simulated receipt flow — Gemini, storage, and payment signing are not connected yet.
      </p>
      {step === 'home' ? (
        <ClaimHome
          eventName={event.name}
          available={subtract(mandate.remainingBudget, COMMITTED)}
          budget={mandate.initialBudget}
          claims={recentClaims}
          onCapture={onCapture}
        />
      ) : null}

      {step === 'reading' && photoUrl ? <Reading photoUrl={photoUrl} /> : null}

      {step === 'confirm' && photoUrl ? (
        <ReceiptConfirm
          photoUrl={photoUrl}
          analysis={analysis}
          onRetake={reset}
          onSubmit={onSubmit}
        />
      ) : null}

      {step === 'checking' && decision ? (
        <RuleCheck decision={decision} onSettled={onSettled} />
      ) : null}

      {step === 'paid' && draft && payment ? (
        <Paid amount={draft.amount} payment={payment} onDone={reset} />
      ) : null}

      {step === 'held' && draft && decision ? (
        <Held amount={draft.amount} decision={decision} onDone={reset} />
      ) : null}
    </div>
  );
}
