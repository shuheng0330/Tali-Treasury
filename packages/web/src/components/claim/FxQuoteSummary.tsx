import { toDisplay, type Claim } from '@tali/shared';

/** Show exact micro-USDC precision: approval must not hide rounded fractions. */
export function FxQuoteSummary({ claim }: { claim: Claim }) {
  const quote = claim.fxQuote;
  if (!quote) return null;
  return (
    <div className="tnum rounded-card border border-rule bg-canvas p-4 text-body text-ink-2">
      <p className="font-medium">{toDisplay(quote.sourceAmount)} MYR → {toDisplay(quote.targetAmount, 6)} USDC</p>
      <p>{claim.state === 'paid' ? 'Paid using the saved quote.' : 'Quoted reimbursement — not a currency exchange.'}</p>
      <p>Open Exchange Rates · 1 USD = {quote.myrPerUsd} MYR</p>
      <p>Rate published: {new Date(quote.rateTimestampMs).toISOString()}</p>
      <p>Quote expires: {new Date(quote.expiresAtMs).toISOString()}</p>
      <p>Valuation assumes 1 USDC = 1 USD. Hourly FX reference data, not a live USDC market price. Payment uses existing Testnet USDC.</p>
      <p>Rounded to the nearest 0.000001 USDC (half up).</p>
    </div>
  );
}
