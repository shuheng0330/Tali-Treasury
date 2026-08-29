import type { Claim, Event, EventMember, MandateView } from '@tali/shared';
import { toBaseUnits } from '@tali/shared';

export const MANDATE_ID =
  '0x7be8aa82872facbd01372cdeb20375a82f74011dca1512e41737664a759dc523';

export const TREASURER = '0x2d11a7c4e8b93f5a1c6d0e2f4b8a7c93e5d1f0a2b4c6d8e0f2a4b6c8d0e2f7ea4';
export const MEMBER = '0x41ff9a03c2b45e17d8093f6a2c5b8e04d7f1a396c2e5b8d1f4a7c0e3b6d9a9a03';
export const VENDOR = '0x9c2b4f10a7e35d81c06b2e94f07a1c38d5e60b2f4a83c197e5d02b6f8a4c1e77';

export const mandate: MandateView = {
  id: MANDATE_ID,
  coinType: '0x2::sui::SUI',
  initialBudget: toBaseUnits('2000.00'),
  remainingBudget: toBaseUnits('1588.00'),
  amountSpent: toBaseUnits('412.00'),
  maxPerClaim: toBaseUnits('200.00'),
  expiryMs: Date.parse('2026-09-08T14:00:00Z'),
  revoked: false,
  approvedRecipients: [MEMBER, VENDOR],
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
export const COMMITTED = toBaseUnits('180.00');

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
    amount: toBaseUnits('84.00'),
    merchant: 'Restoran Nasi Kandar Line Clear',
    createdAtMs: Date.now() - 7_200_000,
    updatedAtMs: Date.now() - 7_199_000,
  }),
  claim({
    id: 'c-0141',
    state: 'awaiting_review',
    amount: toBaseUnits('340.00'),
    merchant: 'Campus Print Shop',
    category: 'printing',
    createdAtMs: Date.now() - 50_400_000,
    updatedAtMs: Date.now() - 50_400_000,
  }),
  claim({
    id: 'c-0140',
    state: 'paid',
    amount: toBaseUnits('22.50'),
    merchant: 'Grab',
    category: 'transport',
    createdAtMs: Date.now() - 93_600_000,
    updatedAtMs: Date.now() - 93_599_000,
  }),
];
