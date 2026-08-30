'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  Claim,
  CreateClaimRequest,
  DraftClaim,
  MandateView,
  ReceiptAnalysis,
} from '@tali/shared';
import { analyzeReceipt, createClaim, listClaims, TaliApiError } from '@/lib/api/client';
import {
  DEMO_EVENT_ID,
  DEMO_EVENT_NAME,
  DEMO_SUBMITTER,
} from '@/lib/demo-config';
import { ClaimHome } from './ClaimHome';
import { ReceiptConfirm } from './ReceiptConfirm';
import { Submitted } from './Outcome';

type Step = 'home' | 'reading' | 'confirm' | 'submitting' | 'submitted';

interface Props {
  apiEnabled: boolean;
  initialMandate: MandateView | null;
  mandateReadError?: string;
}

function messageFor(error: unknown): string {
  if (error instanceof TaliApiError) {
    if (error.code === 'authentication_required') {
      return 'Receipt submission requires wallet authentication, which is not configured yet.';
    }
    if (error.code === 'duplicate_receipt') {
      return 'This receipt has already been submitted.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'The request failed. Please try again.';
}

function Reading({ photoUrl, submitting = false }: { photoUrl: string; submitting?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-5 pt-6">
      <div className="relative w-full overflow-hidden rounded-card border border-rule bg-raised">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="The receipt you photographed" className="max-h-64 w-full object-contain" />
        <span className="absolute inset-0 animate-breathe bg-accent/10" aria-hidden />
      </div>
      <p className="text-subhead text-ink-2" aria-live="polite">
        {submitting ? 'Submitting your claim…' : 'Reading your receipt…'}
      </p>
    </div>
  );
}

function confirmedAnalysis(analysis: ReceiptAnalysis, draft: DraftClaim): ReceiptAnalysis {
  const merchant = draft.merchant.trim();
  return {
    ...analysis,
    merchant,
    amount: draft.amount,
    receiptDate: draft.receiptDate,
    category: draft.category,
    uncertainFields: [],
    fuzzyKey: [merchant.toLowerCase().replace(/\s+/g, ' '), draft.receiptDate, draft.amount].join('|'),
  };
}

export function ClaimFlow({ apiEnabled, initialMandate, mandateReadError }: Props) {
  const [step, setStep] = useState<Step>('home');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ReceiptAnalysis | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [submittedClaim, setSubmittedClaim] = useState<Claim | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(apiEnabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  useEffect(() => {
    if (!apiEnabled) return;

    let active = true;
    listClaims(DEMO_EVENT_ID, DEMO_SUBMITTER)
      .then(({ claims: loaded }) => {
        if (active) {
          setClaims(
            loaded.filter(
              (claim) => claim.submitter.toLowerCase() === DEMO_SUBMITTER.toLowerCase(),
            ),
          );
        }
      })
      .catch((cause) => {
        if (active) setError(`Could not load claims: ${messageFor(cause)}`);
      })
      .finally(() => {
        if (active) setClaimsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [apiEnabled]);

  const onCapture = useCallback(async (file: File) => {
    setError(null);
    setAnalysis(null);
    setStoragePath(null);
    setPhotoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
    setStep('reading');

    try {
      const result = await analyzeReceipt(file, DEMO_EVENT_ID, DEMO_SUBMITTER);
      if (result.duplicateOf) {
        throw new TaliApiError(
          `This receipt is already attached to claim ${result.duplicateOf}.`,
          'duplicate_receipt',
          409,
        );
      }
      setAnalysis(result.analysis);
      setStoragePath(result.storagePath);
      setStep('confirm');
    } catch (cause) {
      setError(messageFor(cause));
      setPhotoUrl(null);
      setStep('home');
    }
  }, []);

  const onSubmit = useCallback(async (draft: DraftClaim) => {
    if (!analysis || !storagePath) return;

    setError(null);
    setStep('submitting');
    const request: CreateClaimRequest = {
      eventId: DEMO_EVENT_ID,
      submitter: DEMO_SUBMITTER,
      amount: draft.amount,
      merchant: draft.merchant.trim(),
      receiptDate: draft.receiptDate,
      category: draft.category,
      description: draft.description.trim(),
      storagePath,
      analysis: confirmedAnalysis(analysis, draft),
    };

    try {
      const { claim } = await createClaim(request);
      setClaims((current) => [claim, ...current.filter((item) => item.id !== claim.id)]);
      setSubmittedClaim(claim);
      setStep('submitted');
    } catch (cause) {
      setError(messageFor(cause));
      setStep('confirm');
    }
  }, [analysis, storagePath]);

  const reset = useCallback(() => {
    setAnalysis(null);
    setStoragePath(null);
    setSubmittedClaim(null);
    setError(null);
    setPhotoUrl(null);
    setStep('home');
  }, []);

  const budget = initialMandate?.initialBudget ?? '0';
  const available = initialMandate?.remainingBudget ?? '0';

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 py-6">
      <p
        className={`mb-4 rounded-control border p-3 text-body ${
          apiEnabled
            ? 'border-ok-line bg-ok-soft text-ok'
            : 'border-wait-line bg-wait-soft text-wait'
        }`}
      >
        {apiEnabled
          ? 'Live receipt flow — Gemini analysis and private Supabase storage are connected. Policy processing and payment remain pending.'
          : 'Receipt APIs are safely disabled until wallet authentication is configured. This page does not fall back to mock submissions.'}
      </p>

      {mandateReadError ? (
        <p className="mb-4 rounded-control border border-wait-line bg-wait-soft p-3 text-body text-wait">
          Live treasury balance is unavailable: {mandateReadError}
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-control border border-no-line bg-no-soft p-3 text-body text-no" role="alert">
          {error}
        </p>
      ) : null}

      {step === 'home' ? (
        <ClaimHome
          eventName={DEMO_EVENT_NAME}
          available={available}
          budget={budget}
          claims={claims}
          claimsLoading={claimsLoading}
          captureDisabled={!apiEnabled}
          onCapture={onCapture}
        />
      ) : null}

      {step === 'reading' && photoUrl ? <Reading photoUrl={photoUrl} /> : null}

      {step === 'confirm' && photoUrl && analysis ? (
        <ReceiptConfirm
          photoUrl={photoUrl}
          analysis={analysis}
          onRetake={reset}
          onSubmit={onSubmit}
        />
      ) : null}

      {step === 'submitting' && photoUrl ? <Reading photoUrl={photoUrl} submitting /> : null}

      {step === 'submitted' && submittedClaim ? (
        <Submitted claim={submittedClaim} onDone={reset} />
      ) : null}
    </div>
  );
}
