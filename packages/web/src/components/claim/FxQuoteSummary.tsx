import { toDisplay, type Claim } from '@tali/shared';

function formatQuoteTime(atMs: number) {
  return new Intl.DateTimeFormat('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(atMs));
}

/** Show exact micro-USDC precision: approval must not hide rounded fractions. */
export function FxQuoteSummary({
  claim,
  variant = 'full',
}: {
  claim: Claim;
  variant?: 'compact' | 'full';
}) {
  const quote = claim.fxQuote;
  if (!quote) return null;

  if (variant === 'compact') {
    const expired = Date.now() >= quote.expiresAtMs;
    return (
      <div className="tnum rounded-card border border-rule bg-canvas p-4">
        <p className="text-caption text-ink-3">Payout:</p>
        <p className="font-display text-body-lg font-medium">
          {toDisplay(quote.targetAmount, 6)} USDC
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-rule pt-3">
          <div>
            <p className="text-caption text-ink-2">Rate: 1 USD = {quote.myrPerUsd} MYR</p>
            <p className="text-caption text-ink-3">
              {claim.state === 'paid' ? 'Paid using saved quote' : 'Saved reimbursement quote'}
            </p>
          </div>
          <details className="group w-full sm:w-auto">
            <summary className="disclosure-row">Rate Details</summary>
            <dl className="mt-3 grid gap-2 rounded-control bg-raised p-3 text-caption sm:min-w-72">
              <div className="flex justify-between gap-4"><dt className="text-ink-3">Provider</dt><dd>Open Exchange Rates</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-3">Rate</dt><dd>1 USD = {quote.myrPerUsd} MYR</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-3">Published</dt><dd className="break-words text-right">{formatQuoteTime(quote.rateTimestampMs)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-3">Quote expiry</dt><dd className="break-words text-right" suppressHydrationWarning>{expired ? 'Expired' : formatQuoteTime(quote.expiresAtMs)}</dd></div>
              <div className="border-t border-rule pt-2 text-ink-2">USDC valued at USD parity</div>
              <div className="text-ink-2">Rounded to 6 decimals</div>
            </dl>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div className="tnum rounded-card border border-rule bg-canvas p-4 text-body text-ink-2">
      <p className="font-medium">{toDisplay(quote.sourceAmount)} MYR → {toDisplay(quote.targetAmount, 6)} USDC</p>
      <p>{claim.state === 'paid' ? 'Paid using the saved quote.' : claim.state === 'rejected' || claim.state === 'needs_correction' ? 'Previous quote — no payment sent.' : 'Quoted reimbursement — not a currency exchange.'}</p>
      <details className="mt-2">
        <summary className="cursor-pointer rounded-control text-body text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Exchange rate details</summary>
        <p>Open Exchange Rates · 1 USD = {quote.myrPerUsd} MYR</p>
        <p>Rate published: {new Date(quote.rateTimestampMs).toISOString()}</p>
        <p>Quote expires: {new Date(quote.expiresAtMs).toISOString()}</p>
        <p>Valuation assumes 1 USDC = 1 USD. Hourly FX reference data, not a live USDC market price. Payment uses existing Testnet USDC.</p>
        <p>Rounded to the nearest 0.000001 USDC (half up).</p>
      </details>
    </div>
  );
}
