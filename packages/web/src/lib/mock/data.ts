import type { Claim, Event, EventMember, MandateView } from '@tali/shared';
import { toBaseUnits } from '@tali/shared';
import { taliTestnetUsdcConfig, taliUsdcDemo } from '@tali/treasury-sui';

export const MANDATE_ID = taliUsdcDemo.mandateId;

export const TREASURER = taliUsdcDemo.treasurer;
export const MEMBER = taliUsdcDemo.approvedMember;
export const VENDOR = '0x9c2b4f10a7e35d81c06b2e94f07a1c38d5e60b2f4a83c197e5d02b6f8a4c1e77';

export const mandate: MandateView = {
  id: MANDATE_ID,
  coinType: taliTestnetUsdcConfig.coinType,
  initialBudget: toBaseUnits('20.00'),
  remainingBudget: toBaseUnits('17.00'),
  amountSpent: toBaseUnits('3.00'),
  maxPerClaim: toBaseUnits('5.00'),
  expiryMs: Number(taliUsdcDemo.expiryMs),
  revoked: false,
  approvedRecipients: [MEMBER],
  fetchedAtMs: Date.now(),
};

export const event: Event = {
  id: 'orientation-week',
  name: 'Orientation Week',
  organisation: 'FSKTM Blockchain Society',
  mandateId: MANDATE_ID,
  treasurer: TREASURER,
  allowedCategories: ['food', 'printing', 'transport', 'venue', 'materials'],
  createdAtMs: Date.parse('2026-08-24T09:00:00Z'),
};

export const members: EventMember[] = [
  { eventId: event.id, address: MEMBER, displayName: 'Kian Xiang', addedAtMs: event.createdAtMs },
  { eventId: event.id, address: VENDOR, displayName: 'Wey Cheng', addedAtMs: event.createdAtMs },
];

/** Committed but not yet settled on chain. */
export const COMMITTED = toBaseUnits('4.00');

function claim(partial: Partial<Claim> & Pick<Claim, 'id' | 'state' | 'amount' | 'merchant'>): Claim {
  return {
    eventId: event.id,
    submitter: MEMBER,
    submitterName: 'Kian Xiang',
    receiptDate: '2026-08-28',
    category: 'food',
    description: '',
    receiptUrl: null,
    receiptHash: '',
    analysis: null,
    decision: null,
    review: null,
    paymentAttempt: null,
    payment: null,
    createdAtMs: Date.now() - 86_400_000,
    updatedAtMs: Date.now() - 86_400_000,
    ...partial,
  };
}

export const seededClaims: Claim[] = [
  claim({
    id: 'c-0142',
    state: 'paid',
    amount: toBaseUnits('3.00'),
    merchant: 'Restoran Nasi Kandar Line Clear',
    createdAtMs: Date.now() - 7_200_000,
    updatedAtMs: Date.now() - 7_199_000,
  }),
];

export const STRANGER =
  '0x41ff9a03c2b45e17d8093f6a2c5b8e04d7f1a396c2e5b8d1f4a7c0e3b6d90000';

export const queuedClaims: Claim[] = [
  claim({
    id: 'q-0148',
    state: 'awaiting_review',
    amount: toBaseUnits('15.00'),
    merchant: 'Campus Print Shop',
    category: 'printing',
    submitterName: 'Wey Cheng',
    submitter: VENDOR,
    createdAtMs: Date.now() - 120_000,
    updatedAtMs: Date.now() - 120_000,
  }),
  claim({
    id: 'q-0147',
    state: 'awaiting_review',
    amount: toBaseUnits('4.00'),
    merchant: 'Dewan Sri Pinang',
    category: 'venue',
    submitterName: 'Shu Heng',
    submitter: STRANGER,
    createdAtMs: Date.now() - 840_000,
    updatedAtMs: Date.now() - 840_000,
  }),
  claim({
    id: 'q-0146',
    state: 'awaiting_review',
    amount: toBaseUnits('3.50'),
    merchant: 'Mydin Mall',
    category: 'materials',
    submitterName: 'Kian Xiang',
    createdAtMs: Date.now() - 3_600_000,
    updatedAtMs: Date.now() - 3_600_000,
  }),
];
