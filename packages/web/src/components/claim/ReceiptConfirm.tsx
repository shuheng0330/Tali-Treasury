'use client';

import { useState } from 'react';
import type { DraftClaim, ExpenseCategory, ReceiptAnalysis } from '@tali/shared';
import { COIN_DECIMALS, EXPENSE_CATEGORIES, toBaseUnits, toDisplay } from '@tali/shared';

interface Props {
  photoUrl: string;
  analysis: ReceiptAnalysis | null;
  /** Set when the backend recognised this exact image on an existing claim. */
  duplicateOf: string | null;
  /** Set when the treasurer sent this back, carrying what they asked for. */
  returnedReason?: string | null;
  /**
   * What the claim currently says, when correcting one. The analysis holds the
   * original extraction, which is not the same thing: the member may already
   * have fixed a field before submitting, and showing them the old reading
   * would ask them to correct it a second time.
   */
  initial?: {
    merchant: string;
    amount: string;
    receiptDate: string;
    category: ExpenseCategory;
    description: string;
  } | null;
  submitLabel?: string;
  onRetake: () => void;
  onSubmit: (draft: DraftClaim) => void;
}

function Field({
  label,
  uncertain,
  children,
}: {
  label: string;
  uncertain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 rounded-control px-3 py-2 ${
        uncertain ? 'border border-wait-line bg-wait-soft' : 'border border-rule bg-surface'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="text-body font-medium text-ink-2">{label}</span>
        {uncertain ? <span className="text-caption text-wait">not sure</span> : null}
      </span>
      {children}
    </label>
  );
}

export function ReceiptConfirm({
  photoUrl,
  analysis,
  duplicateOf,
  returnedReason = null,
  initial = null,
  submitLabel = 'Submit claim',
  onRetake,
  onSubmit,
}: Props) {
  const failed = analysis === null && initial === null;
  const [zoomed, setZoomed] = useState(false);
  /* A stored receipt is fetched behind a signed URL with a short expiry, so a
     screen left open long enough gets a 403 and a broken-image icon beside the
     figures — which reads as the receipt itself being lost. */
  const [imageFailed, setImageFailed] = useState(false);
  const [merchant, setMerchant] = useState(initial?.merchant ?? analysis?.merchant ?? '');
  const [amount, setAmount] = useState(() => {
    const source = initial?.amount ?? analysis?.amount;
    /* Six digits, not two. `toDisplay` truncates, so prefilling a correction
       at 2dp silently drops the rest of an amount the member never touched. */
    return source ? toDisplay(source, COIN_DECIMALS).replace(/0+$/, '').replace(/\.$/, '') : '';
  });
  const [receiptDate, setReceiptDate] = useState(
    initial?.receiptDate ?? analysis?.receiptDate ?? '',
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    initial?.category ?? analysis?.category ?? 'other',
  );
  const [description, setDescription] = useState(initial?.description ?? '');

  const currency = analysis?.currency ?? 'MYR';
  const uncertain = new Set(analysis?.uncertainFields ?? []);
  const normalizedAmount = amount.replace(/[,\s]/g, '');
  const amountIsValid =
    /^\d+(?:\.\d{1,6})?$/.test(normalizedAmount) &&
    BigInt(toBaseUnits(normalizedAmount)) > 0n;
  /* Every other disabled control on this screen says what is stopping it. A
     dead submit button with nothing beside it leaves the member re-reading a
     filled-in form looking for the field they missed. */
  const blocking =
    duplicateOf !== null
      ? null
      : merchant.trim() === ''
        ? 'the merchant'
        : !amountIsValid
          ? 'an amount above zero'
          : receiptDate.trim() === ''
            ? 'the date'
            : description.trim() === ''
              ? 'a short description'
              : null;
  const ready = duplicateOf === null && blocking === null;

  return (
    <div className="flex flex-col gap-4">
      {returnedReason ? (
        <div className="flex flex-col gap-1 rounded-card border border-wait-line bg-wait-soft p-4">
          <span className="text-caption font-medium text-wait">
            The treasurer sent this back
          </span>
          <p className="text-body text-ink-2">{returnedReason}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h1 className="text-heading">
          {returnedReason ? 'Correct the details' : 'Check the details'}
        </h1>
        <button
          type="button"
          onClick={onRetake}
          className="btn btn--ghost h-9 px-4 text-label"
        >
          Retake
        </button>
      </div>

      {photoUrl && !imageFailed ? (
        <button
          type="button"
          onClick={() => setZoomed((open) => !open)}
          className="overflow-hidden rounded-card border border-rule bg-raised"
          aria-label={zoomed ? 'Shrink receipt' : 'Zoom receipt'}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            onError={() => setImageFailed(true)}
            alt="The receipt you photographed"
            className={`w-full object-contain transition-[max-height] duration-200 ease-pop ${
              zoomed ? 'max-h-[70vh]' : 'max-h-40'
            }`}
          />
        </button>
      ) : (
        /* A stored receipt is fetched behind a signed URL that can expire. An
           empty <img> would render as a broken-image icon beside the figures,
           which reads as the receipt itself being lost. */
        <p className="rounded-card border border-dashed border-rule bg-surface p-4 text-caption text-ink-3">
          {imageFailed
            ? 'The link to this receipt has expired. Reopen the claim to fetch it again — the figures below are what the claim says.'
            : 'The receipt image is not available on this screen. The figures below are what the claim says.'}
        </p>
      )}

      {failed ? (
        <p className="text-body text-wait">
          Couldn&rsquo;t read this receipt. Enter the details manually.
        </p>
      ) : null}

      {duplicateOf ? (
        <p className="rounded-card border border-wait-line bg-wait-soft p-4 text-caption text-wait">
          <span className="font-medium">This receipt has been claimed before.</span>{' '}
          <span className="text-ink-2">
            The same image is already attached to claim{' '}
            <span className="font-mono">{duplicateOf.slice(0, 8)}</span>, so this one cannot be
            submitted. Photograph a different receipt.
          </span>
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Field label="Merchant" uncertain={uncertain.has('merchant')}>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Where you paid"
            className="bg-transparent text-body outline-none placeholder:text-ink-3"
          />
        </Field>

        <Field label="Amount" uncertain={uncertain.has('amount')}>
          <span className="flex items-baseline gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="tnum w-full bg-transparent text-title outline-none placeholder:text-ink-3"
            />
            <span className="text-body text-ink-3">{currency}</span>
          </span>
        </Field>

        <Field label="Date" uncertain={uncertain.has('receiptDate')}>
          <input
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
            className="tnum bg-transparent text-body outline-none"
          />
        </Field>

        <Field label="Category" uncertain={uncertain.has('category')}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="bg-transparent text-body capitalize outline-none"
          >
            {EXPENSE_CATEGORIES.map((option) => (
              <option key={option} value={option} className="capitalize">
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Short description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was this expense for?"
            className="bg-transparent text-body outline-none placeholder:text-ink-3"
          />
        </Field>
      </div>

      <p className="text-body text-ink-2">
        {currency === 'USDC'
          ? 'The confirmed amount can be checked directly against the USDC mandate.'
          : `The original ${currency} amount will be stored. An explicit USDC conversion quote is required before any payment.`}
      </p>

      <button
        type="button"
        disabled={!ready}
        onClick={() => onSubmit({
          merchant,
          amount: toBaseUnits(normalizedAmount),
          receiptDate,
          category,
          description,
          confidence: analysis?.confidence ?? 0,
          receiptHash: analysis?.receiptHash ?? '',
        })}
        className="btn btn--primary btn--block btn--lg mt-2"
      >
        {duplicateOf ? 'Already claimed' : submitLabel}
      </button>

      {blocking ? (
        <p className="text-center text-caption text-ink-3">
          Still needs {blocking}.
        </p>
      ) : null}
    </div>
  );
}
