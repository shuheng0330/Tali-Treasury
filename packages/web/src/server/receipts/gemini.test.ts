import type { GenerateContentParameters } from '@google/genai';
import { describe, expect, it } from 'vitest';

import {
  createGeminiReceiptAnalyzer,
  createGoogleGeminiReceiptAnalyzer,
  receiptAnalysisJsonSchema,
  type GeminiModelClient,
} from './gemini';

const validResponse = {
  merchant: 'Campus Print Shop',
  amount: '4.50',
  currency: 'MYR',
  receiptDate: '2026-08-30',
  category: 'printing',
  confidence: 0.96,
  uncertainFields: [],
  warnings: [],
};

const clientReturning = (text: string | undefined): GeminiModelClient => ({
  generateContent: async () => ({ text }),
});

describe('receiptAnalysisJsonSchema', () => {
  it('keeps the category enum aligned with the shared contract', () => {
    expect(receiptAnalysisJsonSchema.properties.category.anyOf[0].enum).toEqual([
      'food',
      'printing',
      'transport',
      'venue',
      'materials',
      'other',
    ]);
  });
});

describe('createGeminiReceiptAnalyzer', () => {
  it('submits image bytes for structured output and validates the response', async () => {
    let capturedRequest: GenerateContentParameters | undefined;
    const client: GeminiModelClient = {
      generateContent: async (request) => {
        capturedRequest = request;
        return {
          text: JSON.stringify({
            ...validResponse,
            merchant: '  Campus Print Shop ',
            amount: '4.5',
            currency: 'myr',
          }),
        };
      },
    };
    const analyzer = createGeminiReceiptAnalyzer({
      client,
      model: 'gemini-test-model',
    });

    const result = await analyzer.analyze({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
    });

    expect(result).toMatchObject({
      merchant: 'Campus Print Shop',
      amount: '4.50',
      currency: 'MYR',
    });
    expect(capturedRequest).toMatchObject({
      model: 'gemini-test-model',
      contents: [
        {
          role: 'user',
          parts: [
            { text: expect.stringContaining('Do not invent') },
            {
              inlineData: {
                data: 'AQID',
                mimeType: 'image/png',
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: expect.objectContaining({ type: 'object' }),
      },
    });
  });

  it('rejects unsupported image types before a network call', async () => {
    let callCount = 0;
    const analyzer = createGeminiReceiptAnalyzer({
      client: {
        generateContent: async () => {
          callCount += 1;
          return { text: JSON.stringify(validResponse) };
        },
      },
      model: 'gemini-test-model',
    });

    await expect(
      analyzer.analyze({ bytes: new Uint8Array([1]), mimeType: 'application/pdf' }),
    ).rejects.toThrow('unsupported receipt image type');
    expect(callCount).toBe(0);
  });

  it('rejects empty and oversized images before a network call', async () => {
    const analyzer = createGeminiReceiptAnalyzer({
      client: clientReturning(JSON.stringify(validResponse)),
      model: 'gemini-test-model',
    });

    await expect(
      analyzer.analyze({ bytes: new Uint8Array(), mimeType: 'image/png' }),
    ).rejects.toThrow('must not be empty');
    await expect(
      analyzer.analyze({
        bytes: new Uint8Array(10 * 1024 * 1024 + 1),
        mimeType: 'image/png',
      }),
    ).rejects.toThrow('10 MiB');
  });

  it.each([
    [undefined, 'empty response'],
    ['', 'empty response'],
    ['not JSON', 'invalid JSON'],
    [JSON.stringify({ ...validResponse, amount: '0.00' }), 'invalid receipt'],
  ])('fails closed for %s', async (responseText, expectedMessage) => {
    const analyzer = createGeminiReceiptAnalyzer({
      client: clientReturning(responseText),
      model: 'gemini-test-model',
    });

    await expect(
      analyzer.analyze({ bytes: new Uint8Array([1]), mimeType: 'image/png' }),
    ).rejects.toThrow(expectedMessage);
  });

  it('requires credentials and model when constructing the real client', () => {
    expect(() =>
      createGoogleGeminiReceiptAnalyzer({ apiKey: '   ', model: 'gemini-test-model' }),
    ).toThrow('GEMINI_API_KEY');
    expect(() =>
      createGoogleGeminiReceiptAnalyzer({ apiKey: 'test-key', model: '   ' }),
    ).toThrow('model');
  });
});
