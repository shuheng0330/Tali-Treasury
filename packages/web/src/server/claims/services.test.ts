import type {
  Claim,
  CreateClaimRequest,
  ReceiptAnalysis,
} from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../errors';
import type { ClaimRepository, ReceiptStore } from './ports';
import {
  createAnalyzeReceiptService,
  createClaimService,
  createListClaimsService,
} from './services';

const eventId = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
const submitter = `0x${'a'.repeat(64)}`;
const receiptHash =
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const storagePath = `${eventId}/${receiptHash}.png`;

const analysis: ReceiptAnalysis = {
  merchant: 'Campus Print Shop',
  amount: '4500000',
  currency: 'MYR',
  receiptDate: '2026-08-30',
  category: 'printing',
  confidence: 0.96,
  uncertainFields: [],
  warnings: [],
  receiptHash,
  fuzzyKey: 'campus print shop|2026-08-30|4500000',
};

const claim: Claim = {
  id: '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7',
  eventId,
  submitter,
  submitterName: 'Lim Wey Cheng',
  state: 'submitted',
  amount: '4500000',
  merchant: 'Campus Print Shop',
  receiptDate: '2026-08-30',
  category: 'printing',
  description: '',
  receiptUrl: null,
  receiptHash,
  analysis,
  decision: null,
  payment: null,
  createdAtMs: 1_788_048_000_000,
  updatedAtMs: 1_788_048_000_000,
};

function createRequest(): CreateClaimRequest {
  return {
    eventId,
    submitter,
    amount: '4500000',
    merchant: 'Campus Print Shop',
    receiptDate: '2026-08-30',
    category: 'printing',
    description: '',
    storagePath,
    analysis,
  };
}

function createRepository(overrides: Partial<ClaimRepository> = {}): ClaimRepository {
  return {
    assertEventExists: vi.fn(async () => undefined),
    assertActiveMember: vi.fn(async () => undefined),
    findDuplicateReceipt: vi.fn(async () => null),
    create: vi.fn(async () => claim),
    listByEvent: vi.fn(async () => []),
    ...overrides,
  };
}

function createReceiptStore(overrides: Partial<ReceiptStore> = {}): ReceiptStore {
  return {
    upload: vi.fn(async () => storagePath),
    createSignedUrl: vi.fn(async () => 'https://signed.example/receipt'),
    ...overrides,
  };
}

describe('createAnalyzeReceiptService', () => {
  it('checks active membership before duplicate lookup, Gemini, or upload', async () => {
    const calls: string[] = [];
    const claims = createRepository({
      assertEventExists: vi.fn(async () => {
        calls.push('event');
      }),
      assertActiveMember: vi.fn(async () => {
        calls.push('member');
        throw new ServerError('member_not_found', 403, 'Active event membership is required');
      }),
      findDuplicateReceipt: vi.fn(async () => {
        calls.push('duplicate');
        return null;
      }),
    });
    const analyzer = {
      analyze: vi.fn(async () => {
        calls.push('analyze');
        throw new Error('must not run');
      }),
    };
    const receipts = createReceiptStore({
      upload: vi.fn(async () => {
        calls.push('upload');
        return storagePath;
      }),
    });
    const analyzeReceipt = createAnalyzeReceiptService({ analyzer, claims, receipts });

    await expect(
      analyzeReceipt({
        eventId,
        submitter,
        bytes: Buffer.from('hello'),
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'member_not_found', status: 403 });
    expect(calls).toEqual(['event', 'member']);
  });

  it('returns an event-scoped duplicate without another Gemini call or upload', async () => {
    const claims = createRepository({
      findDuplicateReceipt: vi.fn(async () => ({
        claimId: claim.id,
        analysis,
        storagePath,
      })),
    });
    const analyzer = { analyze: vi.fn() };
    const receipts = createReceiptStore();
    const analyzeReceipt = createAnalyzeReceiptService({ analyzer, claims, receipts });

    await expect(
      analyzeReceipt({
        eventId,
        submitter,
        bytes: Buffer.from('hello'),
        mimeType: 'image/png',
      }),
    ).resolves.toEqual({ analysis, storagePath, duplicateOf: claim.id });
    expect(analyzer.analyze).not.toHaveBeenCalled();
    expect(receipts.upload).not.toHaveBeenCalled();
  });

  it('hashes, analyzes, and uploads a new private receipt in order', async () => {
    const calls: string[] = [];
    const claims = createRepository({
      assertEventExists: vi.fn(async () => {
        calls.push('event');
      }),
      assertActiveMember: vi.fn(async () => {
        calls.push('member');
      }),
      findDuplicateReceipt: vi.fn(async (_event, hash) => {
        calls.push(`duplicate:${hash}`);
        return null;
      }),
    });
    const analyzer = {
      analyze: vi.fn(async () => {
        calls.push('analyze');
        return {
          merchant: 'Campus Print Shop',
          amount: '4.50',
          currency: 'MYR',
          receiptDate: '2026-08-30',
          category: 'printing' as const,
          confidence: 0.96,
          uncertainFields: [],
          warnings: [],
        };
      }),
    };
    const receipts = createReceiptStore({
      upload: vi.fn(async (input) => {
        calls.push(`upload:${input.eventId}`);
        return storagePath;
      }),
    });
    const analyzeReceipt = createAnalyzeReceiptService({ analyzer, claims, receipts });

    await expect(
      analyzeReceipt({
        eventId,
        submitter,
        bytes: Buffer.from('hello'),
        mimeType: 'image/png',
      }),
    ).resolves.toEqual({ analysis, storagePath, duplicateOf: null });
    expect(calls).toEqual([
      'event',
      'member',
      `duplicate:${receiptHash}`,
      'analyze',
      `upload:${eventId}`,
    ]);
  });
});

describe('createClaimService', () => {
  it('rejects malformed or internally inconsistent input before repository access', async () => {
    const claims = createRepository();
    const createClaim = createClaimService({ claims });

    await expect(
      createClaim({ ...createRequest(), amount: '4500001' }),
    ).rejects.toMatchObject({ code: 'invalid_request', status: 400 });
    expect(claims.create).not.toHaveBeenCalled();
  });

  it('persists a valid shared CreateClaimRequest', async () => {
    const claims = createRepository();
    const createClaim = createClaimService({ claims });

    await expect(createClaim(createRequest())).resolves.toEqual({ claim });
    expect(claims.assertEventExists).toHaveBeenCalledWith(eventId);
    expect(claims.assertActiveMember).toHaveBeenCalledWith(eventId, submitter);
    expect(claims.create).toHaveBeenCalledWith(createRequest());
  });

  it('rejects an inactive member before claim insertion', async () => {
    const claims = createRepository({
      assertActiveMember: vi.fn(async () => {
        throw new ServerError('member_not_found', 403, 'Active event membership is required');
      }),
    });
    const createClaim = createClaimService({ claims });

    await expect(createClaim(createRequest())).rejects.toMatchObject({
      code: 'member_not_found',
      status: 403,
    });
    expect(claims.create).not.toHaveBeenCalled();
  });

  it('returns event_not_found before membership or insertion', async () => {
    const claims = createRepository({
      assertEventExists: vi.fn(async () => {
        throw new ServerError('event_not_found', 404, 'Event not found');
      }),
    });
    const createClaim = createClaimService({ claims });

    await expect(createClaim(createRequest())).rejects.toMatchObject({
      code: 'event_not_found',
      status: 404,
    });
    expect(claims.assertActiveMember).not.toHaveBeenCalled();
    expect(claims.create).not.toHaveBeenCalled();
  });

  it('preserves a race-safe duplicate repository error', async () => {
    const claims = createRepository({
      create: vi.fn(async () => {
        throw new ServerError('duplicate_receipt', 409, 'Receipt already claimed');
      }),
    });
    const createClaim = createClaimService({ claims });

    await expect(createClaim(createRequest())).rejects.toMatchObject({
      code: 'duplicate_receipt',
      status: 409,
    });
  });
});

describe('createListClaimsService', () => {
  it('signs only the private paths selected by the event query for 300 seconds', async () => {
    const claims = createRepository({
      listByEvent: vi.fn(async () => [{ claim, storagePath }]),
    });
    const receipts = createReceiptStore();
    const listClaims = createListClaimsService({ claims, receipts });

    await expect(listClaims({ eventId, viewer: submitter })).resolves.toEqual({
      claims: [{ ...claim, receiptUrl: 'https://signed.example/receipt' }],
      cursor: null,
    });
    expect(claims.assertEventExists).toHaveBeenCalledWith(eventId);
    expect(claims.assertActiveMember).toHaveBeenCalledWith(eventId, submitter);
    expect(receipts.createSignedUrl).toHaveBeenCalledWith(storagePath, 300);
  });
});
