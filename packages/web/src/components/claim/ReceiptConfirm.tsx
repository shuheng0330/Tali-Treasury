'use client';

import { useState } from 'react';
import type { DraftClaim, ExpenseCategory, ReceiptAnalysis } from '@tali/shared';
import { EXPENSE_CATEGORIES, toBaseUnits, toDisplay } from '@tali/shared';

interface Props {
  photoUrl: string;
  analysis: ReceiptAnalysis | null;
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

export function ReceiptConfirm({ photoUrl, analysis, onRetake, onSubmit }: Props) {
  const failed = analysis === null;
  const [zoomed, setZoomed] = useState(false);
  const [merchant, setMerchant] = useState(analysis?.merchant ?? '');
  const [amount, setAmount] = useState(analysis?.amount ? toDisplay(analysis.amount) : '');
  const [receiptDate, setReceiptDate] = useState(analysis?.receiptDate ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(analysis?.category ?? 'other');
  const [description, setDescription] = useState('');

  const uncertain = new Set(analysis?.uncertainFields ?? []);
  const ready = merchant.trim() !== '' && amount.trim() !== '' && receiptDate.trim() !== '' && description.trim() !== '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-heading">Check the details</h1>
        <button
          type="button"
          onClick={onRetake}
          className="btn btn--ghost h-9 px-4 text-label"
        >
          Retake
        </button>
      </div>

      <button
        type="button"
        onClick={() => setZoomed((open) => !open)}
        className="overflow-hidden rounded-card border border-rule bg-raised"
        aria-label={zoomed ? 'Shrink receipt' : 'Zoom receipt'}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt="The receipt you photographed"
          className={`w-full object-contain transition-[max-height] duration-200 ease-pop ${
            zoomed ? 'max-h-[70vh]' : 'max-h-40'
          }`}
        />
      </button>

      {failed ? (
        <p className="text-body text-wait">
          Couldn&rsquo;t read this receipt. Enter the details manually.
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
            <span className="text-body text-ink-3">MYR</span>
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
        Prototype simplification: the extracted MYR number is reimbursed as the same numeric amount in Testnet USDC; no currency conversion is performed.
      </p>

      <button
        type="button"
        disabled={!ready}
        onClick={() => onSubmit({
          merchant,
          amount: toBaseUnits(amount),
          receiptDate,
          category,
          description,
          confidence: analysis?.confidence ?? 0,
          receiptHash: analysis?.receiptHash ?? '',
        })}
        className="btn btn--primary btn--block btn--lg mt-2"
      >
        Submit claim
      </button>
    </div>
  );
}
