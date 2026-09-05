'use client';

import { useEffect, useState } from 'react';
import type { ExpenseCategory } from '@tali/shared';
import { EXPENSE_CATEGORIES } from '@tali/shared';

import type { ManualClaimRequest } from '@/lib/api/client';
import { Select } from '@/components/Select';

interface Props {
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (fields: ManualClaimRequest) => void;
}

const CURRENCIES = [
  { value: 'MYR' as const, label: 'MYR', note: 'converted before payment' },
  { value: 'USDC' as const, label: 'USDC', note: 'paid as-is' },
];

const AMOUNT = /^\d{1,9}(?:\.\d{1,2})?$/;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 rounded-control border border-rule bg-surface px-3 py-2">
      <span className="text-body font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="text-caption text-ink-3">{hint}</span> : null}
    </label>
  );
}

function isoDay(at: Date): string {
  const month = `${at.getMonth() + 1}`.padStart(2, '0');
  const day = `${at.getDate()}`.padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

/**
 * A claim for an expense nobody photographed.
 *
 * The same fields the confirm screen shows after a reading, asked for directly.
 * Currency is a choice here where it is a reading there: an extraction knows
 * what the receipt said, and a person typing knows what they spent.
 *
 * It says plainly that a treasurer will look at it. That is not a warning, it
 * is the deal — a claim with no receipt behind it is exactly the claim that
 * should not be paid automatically, and saying so up front is fairer than
 * letting somebody discover it in the queue.
 */
export function ManualClaim({ submitting, onCancel, onSubmit }: Props) {
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'MYR' | 'USDC'>('MYR');
  const [receiptDate, setReceiptDate] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [description, setDescription] = useState('');
  const [today, setToday] = useState('');

  useEffect(() => {
    const day = isoDay(new Date());
    setToday(day);
    setReceiptDate((current) => current || day);
  }, []);

  const missing = merchant.trim() === ''
    ? 'who you paid'
    : amount.trim() === ''
      ? 'the amount'
      : !AMOUNT.test(amount.trim())
        ? 'the amount as a number, to at most two decimals'
        : !/[1-9]/.test(amount)
          ? 'more than nothing in the amount'
          : receiptDate === ''
            ? 'the date you spent it'
            : description.trim() === ''
              ? 'a short description'
              : null;
  const ready = missing === null && !submitting;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-heading">Enter a claim</h1>
        <p className="text-body text-ink-2">
          For an expense with no receipt to photograph. A treasurer reviews every claim
          entered this way before anything is paid.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <Field label="Who you paid">
          <input
            value={merchant}
            placeholder="Grab"
            onChange={(event) => setMerchant(event.target.value)}
            className="bg-transparent text-body outline-none placeholder:text-ink-3"
          />
        </Field>

        <Field label="Amount">
          <span className="flex items-baseline gap-2">
            <input
              value={amount}
              inputMode="decimal"
              placeholder="0.00"
              onChange={(event) => setAmount(event.target.value)}
              className="tnum w-full bg-transparent text-title outline-none placeholder:text-ink-3"
            />
            <span className="text-body text-ink-3">{currency}</span>
          </span>
        </Field>

        <Select
          label="Currency"
          value={currency}
          onChange={setCurrency}
          options={CURRENCIES}
          hint={
            currency === 'USDC'
              ? 'Paid straight from the treasury once approved.'
              : 'The ringgit figure is stored. A conversion quote is required before payment.'
          }
        />

        <Field label="Date">
          <input
            type="date"
            value={receiptDate}
            max={today || undefined}
            onChange={(event) => setReceiptDate(event.target.value)}
            className="tnum bg-transparent text-body outline-none"
          />
        </Field>

        <Select
          label="Category"
          value={category}
          onChange={setCategory}
          options={EXPENSE_CATEGORIES.map((option) => ({
            value: option,
            label: option.charAt(0).toUpperCase() + option.slice(1),
          }))}
        />

        <Field label="Short description" hint="What it was for, in a few words.">
          <input
            value={description}
            placeholder="Taxi to the venue for setup"
            onChange={(event) => setDescription(event.target.value)}
            className="bg-transparent text-body outline-none placeholder:text-ink-3"
          />
        </Field>
      </section>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!ready}
          onClick={() =>
            onSubmit({
              merchant: merchant.trim(),
              amount: amount.trim(),
              currency,
              receiptDate,
              category,
              description: description.trim(),
            })
          }
          className="btn btn--primary btn--block btn--lg"
        >
          {submitting ? 'Sending…' : 'Send for review'}
        </button>

        {missing ? (
          <p className="text-center text-caption text-ink-3">Still needs {missing}.</p>
        ) : null}

        <button type="button" onClick={onCancel} className="btn btn--ghost btn--block">
          Cancel
        </button>
      </div>
    </div>
  );
}
