import { describe, expect, it, vi } from 'vitest';
import { claimPaymentAmount, convertMyrToUsdc, isFxQuote, type Claim, type FxQuote, type MandateView } from '@tali/shared';
import { createOpenExchangeRateReader, type FxRate, type RateCache } from './rates';
import { createClaimQuoter } from './quotes';
import { evaluatePolicy } from '../policy/evaluate';
import { createProcessClaimService, createReviewClaimService, createReconcileClaimService } from '../claims/services';
import { createPayApprovedClaimService } from '../claims/pay';
import type { ClaimRepository, ClaimProcessContext, PaymentExecutor } from '../claims/ports';

const now = Date.parse('2026-09-03T09:00:00Z');
const claimId = '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7';
const eventId = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
const treasurer = `0x${'b'.repeat(64)}`;
const member = `0x${'a'.repeat(64)}`;
const mandateId = `0x${'1'.repeat(64)}`;
const rate: FxRate = { myrPerUsd: '4', rateTimestampMs: now - 60_000, fetchedAtMs: now };
const quote: FxQuote = {
  id: '11111111-1111-4111-8111-111111111111', claimId, eventId, recipient: member, mandateId,
  provider: 'open_exchange_rates', sourceCurrency: 'MYR', targetCurrency: 'USDC', sourceAmount: '17250000',
  targetAmount: '4312500', ...rate, createdAtMs: now, expiresAtMs: now + 900_000,
  valuation: 'USDC_USD_PARITY', rounding: 'HALF_UP_6DP',
};
const claim: Claim = {
  id: claimId, eventId, submitter: member, submitterName: 'Test member', state: 'submitted',
  amount: '17250000', merchant: 'Test shop', receiptDate: '2026-09-03', category: 'printing', description: '',
  receiptUrl: null, receiptHash: 'a'.repeat(64), review: null, payment: null, paymentAttempt: null,
  decision: null, createdAtMs: now, updatedAtMs: now,
  analysis: { amount: '17250000', currency: 'MYR', merchant: 'Test shop', receiptDate: '2026-09-03',
    category: 'printing', confidence: 1, uncertainFields: [], warnings: [], receiptHash: 'a'.repeat(64), fuzzyKey: 'test' },
};
const event = { treasurer, mandateId, allowedCategories: ['printing' as const], startsAtMs: now - 86400_000, expiresAtMs: now + 86400_000 };
const mandate: MandateView = { id: mandateId, coinType: 'test::usdc::USDC', initialBudget: '20000000',
  remainingBudget: '16000000', amountSpent: '4000000', maxPerClaim: '5000000', expiryMs: now + 86400_000,
  revoked: false, approvedRecipients: [member], fetchedAtMs: now };
const decision = evaluatePolicy({ claim: { ...claim, fxQuote: quote }, mandate, event, exactDuplicate: false, nowMs: now });

describe('exact MYR quote arithmetic', () => {
  it.each([
    ['17250000', '4', '4312500'], ['1000000', '3', '333333'],
    ['3', '2', '2'], ['5', '4', '1'], ['1000000', '4.125', '242424'],
  ])('converts %s units at %s MYR/USD to %s micro-USDC', (amount, rate, expected) => {
    expect(convertMyrToUsdc(amount, rate)).toBe(expected);
  });
  it.each(['0', '-1', '1.5', '1e6', '18446744073709551616'])('rejects invalid amount %s', amount => {
    expect(() => convertMyrToUsdc(amount, '4')).toThrow();
  });
  it.each(['0', '-4', 'NaN', 'Infinity', '4e0', '0.9', '21', '4.1234567890123'])('rejects invalid rate %s', rate => {
    expect(() => convertMyrToUsdc('1000000', rate)).toThrow();
  });
  it('rejects amounts that round to zero', () => expect(() => convertMyrToUsdc('1', '4')).toThrow());
  it('validates quote math, binding, and expiry while preserving historical settlement', () => {
    expect(isFxQuote(quote)).toBe(true);
    expect(isFxQuote({ ...quote, targetAmount: '5000000' })).toBe(false);
    expect(claimPaymentAmount({ ...claim, fxQuote: quote }, now)).toBe('4312500');
    expect(claimPaymentAmount({ ...claim, amount: '1000000', fxQuote: quote }, now)).toBeNull();
    expect(claimPaymentAmount({ ...claim, submitter: treasurer, fxQuote: quote }, now)).toBeNull();
    expect(claimPaymentAmount({ ...claim, fxQuote: quote }, quote.expiresAtMs)).toBeNull();
    expect(claimPaymentAmount({ ...claim, fxQuote: quote })).toBe('4312500');
  });
});

function cache(value: FxRate | null = null): RateCache {
  return { read: vi.fn(async () => value), acquire: vi.fn(async () => true), write: vi.fn() };
}
function reader(body: unknown = { base: 'USD', timestamp: now / 1000, rates: { MYR: 4.1 } }, c = cache(), status = 200) {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
  const read = createOpenExchangeRateReader({ appId: () => 'a'.repeat(32), cache: c, fetch: fetcher, now: () => now });
  return { read, fetcher, c };
}
describe('live reference provider', () => {
  it('uses the free-plan USD base and records the source timestamp', async () => {
    const { read, fetcher, c } = reader();
    expect(await read()).toEqual({ myrPerUsd: '4.1', rateTimestampMs: now, fetchedAtMs: now });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.origin).toBe('https://openexchangerates.org');
    expect(url.searchParams.get('symbols')).toBe('MYR');
    expect(url.searchParams.has('base')).toBe(false);
    expect(c.write).toHaveBeenCalledOnce();
  });
  it('serves fresh shared cache without another provider request', async () => {
    const { read, fetcher } = reader({}, cache(rate));
    expect(await read()).toEqual(rate);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not spend quota if another instance holds the refresh lease', async () => {
    const c = cache(); vi.mocked(c.acquire).mockResolvedValue(false);
    const { read, fetcher } = reader({}, c);
    await expect(read()).rejects.toMatchObject({ code: 'fx_unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { base: 'MYR', timestamp: now / 1000, rates: { MYR: 4 } },
    { base: 'USD', timestamp: (now - 5400_000) / 1000, rates: { MYR: 4 } },
    { base: 'USD', timestamp: (now + 120_000) / 1000, rates: { MYR: 4 } },
    { base: 'USD', timestamp: now / 1000, rates: { MYR: -4 } },
    { base: 'USD', timestamp: now / 1000, rates: {} },
  ])('fails closed on bad provider data %j', async body => {
    const { read, c } = reader(body);
    await expect(read()).rejects.toMatchObject({ code: 'fx_unavailable' });
    expect(c.write).not.toHaveBeenCalled();
  });
  it.each([401, 429, 500])('sanitizes provider failure %s without fallback', async status => {
    const { read } = reader({ message: 'secret response' }, cache(), status);
    await expect(read()).rejects.toMatchObject({ code: 'fx_unavailable' });
    await expect(read()).rejects.not.toHaveProperty('cause');
  });
  it('does not expose a network exception containing credentials', async () => {
    const c = cache();
    const read = createOpenExchangeRateReader({ cache: c, appId: () => 'a'.repeat(32), now: () => now,
      fetch: vi.fn().mockRejectedValue(new Error('secret URL')) });
    await expect(read()).rejects.toMatchObject({ code: 'fx_unavailable' });
    await expect(read()).rejects.not.toHaveProperty('cause');
  });
  it('requires a configured credential when there is no cache', async () => {
    const fetcher = vi.fn();
    const read = createOpenExchangeRateReader({ cache: cache(), appId: () => undefined, fetch: fetcher });
    await expect(read()).rejects.toMatchObject({ code: 'fx_unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function workflow(initial: Claim = { ...claim }) {
  let stored = initial;
  const claims: ClaimRepository = {
    assertEventExists: vi.fn(), assertActiveMember: vi.fn(), assertEventViewer: vi.fn(),
    findDuplicateReceipt: vi.fn(), create: vi.fn(), listByEvent: vi.fn(),
    reservePayment: vi.fn<ClaimRepository['reservePayment']>(async () => {
      stored = { ...stored, state: 'paying', payment: null, paymentAttempt: null };
      return { status: 'saved', claim: stored };
    }),
    failApprovedPayment: vi.fn(),
    resubmit: vi.fn(),
    getProcessContext: vi.fn(async (): Promise<ClaimProcessContext> => ({ claim: stored, event, paymentAttemptBudgetBefore: stored.paymentAttempt ? '16000000' : null })),
    saveFxQuote: vi.fn<NonNullable<ClaimRepository['saveFxQuote']>>(async ({ quote }) => { stored = { ...stored, fxQuote: quote, decision: null, state: 'submitted' }; return { status: 'saved', claim: stored }; }),
    saveDecision: vi.fn<ClaimRepository['saveDecision']>(async ({ decision, state }) => { stored = { ...stored, decision, state }; return { status: 'saved', claim: stored }; }),
    applyReview: vi.fn<ClaimRepository['applyReview']>(async ({ review }) => { stored = { ...stored, review, state: 'approved' }; return { status: 'saved', claim: stored }; }),
    recordPaymentAttempt: vi.fn<ClaimRepository['recordPaymentAttempt']>(async ({ digest, preparedAtMs }) => { stored = { ...stored, paymentAttempt: { digest, preparedAtMs, lastCheckedAtMs: null } }; return { status: 'saved', claim: stored }; }),
    markPaymentAttemptChecked: vi.fn<ClaimRepository['markPaymentAttemptChecked']>(async () => ({ status: 'saved', claim: stored })),
    finishPayment: vi.fn<ClaimRepository['finishPayment']>(async ({ state, payment }) => { stored = { ...stored, state, payment }; return { status: 'saved', claim: stored }; }),
  };
  const payments: PaymentExecutor = { assertReady: vi.fn(), execute: vi.fn<PaymentExecutor['execute']>(async (_, record) => {
    await record({ digest: '4'.repeat(44), preparedAtMs: now });
    return { status: 'paid', payment: { ok: true, digest: '4'.repeat(44), checkpoint: '1', gasUsed: '0', finalityMs: 1,
      abortCode: null, abortKey: null, message: 'Test only', rawError: null, budgetBefore: '16000000', budgetAfter: '11687500' } };
  }), reconcile: vi.fn<PaymentExecutor['reconcile']>(async () => ({ status: 'pending', digest: '4'.repeat(44) })) };
  const rates = vi.fn(async () => rate);
  const quotes = createClaimQuoter({ rates, now: () => now });
  const mandates = { read: vi.fn(async () => mandate) };
  return { claims, payments, rates, quotes, mandates, stored: () => stored };
}

describe('MYR claim workflow', () => {
  it('quotes then forces human review; only explicit approval pays the saved USDC amount', async () => {
    const w = workflow();
    const result = await createProcessClaimService({ ...w, now: () => now })({ claimId, processor: treasurer });
    expect(result.claim.amount).toBe('17250000');
    expect(result.claim.fxQuote?.targetAmount).toBe('4312500');
    expect(result.claim.state).toBe('awaiting_review');
    expect(w.payments.execute).not.toHaveBeenCalled();
    const q = result.claim.fxQuote!;
    await createReviewClaimService({ ...w, now: () => now })({ claimId, reviewer: treasurer, action: 'approve', quoteId: q.id });
    expect(w.stored().state).toBe('approved');
    await createPayApprovedClaimService({ ...w, now: () => now })({ claimId, processor: treasurer });
    expect(w.payments.execute).toHaveBeenCalledWith(expect.objectContaining({ amount: '4312500', recipient: member }), expect.any(Function));
    expect(w.claims.applyReview).toHaveBeenCalledWith(expect.objectContaining({ quoteId: q.id }));
    expect(w.stored().state).toBe('paid');
    expect(w.rates).toHaveBeenCalledOnce();
    await createReviewClaimService({ ...w, now: () => now + 86400_000 })({ claimId, reviewer: treasurer, action: 'approve', quoteId: q.id });
    expect(w.payments.execute).toHaveBeenCalledOnce();
  });
  it('does not fetch or persist a quote for an unauthorized actor', async () => {
    const w = workflow();
    await expect(createProcessClaimService(w)({ claimId, processor: member })).rejects.toMatchObject({ status: 403 });
    expect(w.rates).not.toHaveBeenCalled();
    expect(w.claims.saveFxQuote).not.toHaveBeenCalled();
  });
  it('leaves the submitted claim untouched when the provider is unavailable', async () => {
    const w = workflow(); w.rates.mockRejectedValue(new Error('offline'));
    await expect(createProcessClaimService(w)({ claimId, processor: treasurer })).rejects.toThrow();
    expect(w.claims.saveDecision).not.toHaveBeenCalled();
    expect(w.payments.execute).not.toHaveBeenCalled();
  });
  it.each([undefined, '22222222-2222-4222-8222-222222222222'])('rejects missing/stale quote ID %s', async quoteId => {
    const w = workflow({ ...claim, fxQuote: quote, decision, state: 'awaiting_review' });
    await expect(createReviewClaimService({ ...w, now: () => now })({ claimId, reviewer: treasurer, action: 'approve', quoteId })).rejects.toMatchObject({ status: 409 });
    expect(w.payments.execute).not.toHaveBeenCalled();
  });
  it('rejects an expired quote without signing', async () => {
    const w = workflow({ ...claim, fxQuote: quote, decision, state: 'awaiting_review' });
    await expect(createReviewClaimService({ ...w, now: () => quote.expiresAtMs })({ claimId, reviewer: treasurer, action: 'approve', quoteId: quote.id })).rejects.toMatchObject({ status: 409 });
    expect(w.claims.applyReview).not.toHaveBeenCalled();
    expect(w.payments.execute).not.toHaveBeenCalled();
  });
  it('blocks approval when a concurrent quote refresh wins the database comparison', async () => {
    const w = workflow({ ...claim, fxQuote: quote, decision, state: 'awaiting_review' });
    vi.mocked(w.claims.applyReview).mockResolvedValue({ status: 'lost_race', claim: { ...claim, state: 'submitted', fxQuote: { ...quote, id: '22222222-2222-4222-8222-222222222222' } } });
    await expect(createReviewClaimService({ ...w, now: () => now })({ claimId, reviewer: treasurer, action: 'approve', quoteId: quote.id })).rejects.toMatchObject({ status: 409 });
    expect(w.payments.execute).not.toHaveBeenCalled();
  });
  it('refreshes an expired quote and requires a new human decision', async () => {
    const w = workflow({ ...claim, fxQuote: quote, decision, state: 'awaiting_review' });
    const later = now + 901_000;
    const quotes = createClaimQuoter({ rates: w.rates, now: () => later });
    const result = await createProcessClaimService({ ...w, quotes, now: () => later })({ claimId, processor: treasurer });
    expect(result.claim.fxQuote?.id).not.toBe(quote.id);
    expect(result.claim.state).toBe('awaiting_review');
    expect(w.payments.execute).not.toHaveBeenCalled();
  });
  it.each([
    { maxPerClaim: '4000000' }, { remainingBudget: '4000000' }, { approvedRecipients: [] }, { revoked: true },
  ])('never overrides immutable checks %j', async change => {
    const w = workflow({ ...claim, fxQuote: quote, decision, state: 'awaiting_review' });
    w.mandates.read.mockResolvedValue({ ...mandate, ...change });
    await expect(createReviewClaimService({ ...w, now: () => now })({ claimId, reviewer: treasurer, action: 'approve', quoteId: quote.id })).rejects.toMatchObject({ status: 409 });
    expect(w.payments.execute).not.toHaveBeenCalled();
  });
  it('reconciles after quote expiry using the original amount without a provider or new payment', async () => {
    const w = workflow({ ...claim, fxQuote: quote, decision, state: 'paying', paymentAttempt: { digest: '4'.repeat(44), preparedAtMs: now, lastCheckedAtMs: null } });
    await createReconcileClaimService({ ...w, now: () => now + 86400_000 })({ claimId, reconciler: treasurer });
    expect(w.payments.reconcile).toHaveBeenCalledWith(expect.objectContaining({ amount: '4312500' }));
    expect(w.rates).not.toHaveBeenCalled();
    expect(w.payments.execute).not.toHaveBeenCalled();
  });
  it('does not reinterpret an unquoted legacy MYR paying claim as USDC', async () => {
    const w = workflow({ ...claim, decision, state: 'paying', paymentAttempt: { digest: '4'.repeat(44), preparedAtMs: now, lastCheckedAtMs: null } });
    await expect(createReconcileClaimService(w)({ claimId, reconciler: treasurer })).rejects.toMatchObject({ code: 'payment_reconciliation_unavailable' });
    expect(w.payments.reconcile).not.toHaveBeenCalled();
  });
});
