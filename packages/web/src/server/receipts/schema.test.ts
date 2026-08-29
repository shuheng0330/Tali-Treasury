import { describe, expect, it } from 'vitest';

import { parseGeminiReceiptFields, toReceiptAnalysis } from './schema';

const validFields = {
  merchant: 'Campus Print Shop',
  amount: '4.50',
  currency: 'MYR',
  receiptDate: '2026-08-30',
  category: 'printing',
  confidence: 0.96,
  uncertainFields: [],
  warnings: [],
} as const;

describe('parseGeminiReceiptFields', () => {
  it('normalizes strict Gemini output', () => {
    expect(
      parseGeminiReceiptFields({
        ...validFields,
        merchant: '  Campus Print Shop  ',
        amount: '4.5',
        currency: 'myr',
        warnings: ['  total is slightly faded  '],
      }),
    ).toEqual({
      ...validFields,
      amount: '4.50',
      warnings: ['total is slightly faded'],
    });
  });

  it.each(['0', '0.00', '-1.00', '4.567', 'four'])(
    'rejects invalid display amount %s',
    (amount) => {
      expect(() => parseGeminiReceiptFields({ ...validFields, amount })).toThrow();
    },
  );

  it.each(['2026-02-30', '2026-13-01', '30-08-2026'])(
    'rejects invalid receipt date %s',
    (receiptDate) => {
      expect(() =>
        parseGeminiReceiptFields({ ...validFields, receiptDate }),
      ).toThrow();
    },
  );

  it('rejects a category outside the shared contract', () => {
    expect(() =>
      parseGeminiReceiptFields({ ...validFields, category: 'transportation' }),
    ).toThrow();
  });

  it.each([-0.01, 1.01])('rejects confidence outside zero to one', (confidence) => {
    expect(() =>
      parseGeminiReceiptFields({ ...validFields, confidence }),
    ).toThrow();
  });

  it('rejects unknown properties', () => {
    expect(() =>
      parseGeminiReceiptFields({ ...validFields, extractionComplete: true }),
    ).toThrow();
  });

  it('requires null values to be marked uncertain', () => {
    expect(() =>
      parseGeminiReceiptFields({ ...validFields, merchant: null }),
    ).toThrow();

    expect(
      parseGeminiReceiptFields({
        ...validFields,
        merchant: null,
        uncertainFields: ['merchant'],
      }),
    ).toMatchObject({ merchant: null, uncertainFields: ['merchant'] });
  });

  it('rejects an uncertainty marker when the value is present', () => {
    expect(() =>
      parseGeminiReceiptFields({
        ...validFields,
        uncertainFields: ['amount'],
      }),
    ).toThrow();
  });
});

describe('toReceiptAnalysis', () => {
  it('converts display money to USDC base units without floating point', () => {
    const analysis = toReceiptAnalysis(
      parseGeminiReceiptFields(validFields),
      'a'.repeat(64),
    );

    expect(analysis).toEqual({
      merchant: 'Campus Print Shop',
      amount: '4500000',
      currency: 'MYR',
      receiptDate: '2026-08-30',
      category: 'printing',
      confidence: 0.96,
      uncertainFields: [],
      warnings: [],
      receiptHash: 'a'.repeat(64),
      fuzzyKey: 'campus print shop|2026-08-30|4500000',
    });
  });

  it('rejects a malformed receipt hash', () => {
    expect(() =>
      toReceiptAnalysis(parseGeminiReceiptFields(validFields), 'abc'),
    ).toThrow('SHA-256');
  });
});
