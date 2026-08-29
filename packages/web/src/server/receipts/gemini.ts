import { GoogleGenAI, type GenerateContentParameters } from '@google/genai';
import { EXPENSE_CATEGORIES } from '@tali/shared';

import type { ReceiptMimeType } from './hash';
import { parseGeminiReceiptFields, type ParsedReceiptFields } from './schema';

export interface ReceiptImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ReceiptAnalyzer {
  analyze(image: ReceiptImage): Promise<ParsedReceiptFields>;
}

export interface GeminiModelClient {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<{ text: string | undefined }>;
}

const nullableString = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;

export const receiptAnalysisJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    merchant: {
      ...nullableString,
      description: 'Merchant name exactly as visible on the receipt, or null when unclear.',
    },
    amount: {
      ...nullableString,
      description: 'Positive decimal grand total with at most two fractional digits, or null.',
    },
    currency: {
      ...nullableString,
      description: 'Three-letter currency code such as MYR or USD, or null when unclear.',
    },
    receiptDate: {
      ...nullableString,
      description: 'Receipt date in YYYY-MM-DD format, or null when unclear.',
    },
    category: {
      anyOf: [
        { type: 'string', enum: EXPENSE_CATEGORIES },
        { type: 'null' },
      ],
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    uncertainFields: {
      type: 'array',
      uniqueItems: true,
      maxItems: 4,
      items: {
        type: 'string',
        enum: ['merchant', 'amount', 'receiptDate', 'category'],
      },
    },
    warnings: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string' },
    },
  },
  required: [
    'merchant',
    'amount',
    'currency',
    'receiptDate',
    'category',
    'confidence',
    'uncertainFields',
    'warnings',
  ],
} as const;

const RECEIPT_PROMPT = `Extract the receipt into the required JSON structure.
Do not invent missing or unreadable values. Use null for unclear merchant, amount,
receipt date, or category and include each such field in uncertainFields. Use the
displayed grand total, preserve the original currency, classify only into an
allowed category, and lower confidence when the image or a field is ambiguous.`;

const MAX_RECEIPT_IMAGE_BYTES = 10 * 1024 * 1024;
const supportedReceiptImageTypes = new Set<ReceiptMimeType>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function validateReceiptImage(image: ReceiptImage): asserts image is {
  bytes: Uint8Array;
  mimeType: ReceiptMimeType;
} {
  if (!supportedReceiptImageTypes.has(image.mimeType as ReceiptMimeType)) {
    throw new Error(`unsupported receipt image type: ${image.mimeType}`);
  }
  if (image.bytes.byteLength === 0) {
    throw new Error('receipt image must not be empty');
  }
  if (image.bytes.byteLength > MAX_RECEIPT_IMAGE_BYTES) {
    throw new Error('receipt image must not exceed 10 MiB');
  }
}

function parseGeminiResponse(text: string | undefined): ParsedReceiptFields {
  if (!text?.trim()) {
    throw new Error('Gemini returned an empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('Gemini returned invalid JSON', { cause: error });
  }

  try {
    return parseGeminiReceiptFields(parsed);
  } catch (error) {
    throw new Error('Gemini returned an invalid receipt analysis', { cause: error });
  }
}

export function createGeminiReceiptAnalyzer(options: {
  client: GeminiModelClient;
  model: string;
}): ReceiptAnalyzer {
  const model = options.model.trim();
  if (!model) {
    throw new Error('Gemini model is required');
  }

  return {
    async analyze(image): Promise<ParsedReceiptFields> {
      validateReceiptImage(image);
      const response = await options.client.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: RECEIPT_PROMPT },
              {
                inlineData: {
                  data: Buffer.from(image.bytes).toString('base64'),
                  mimeType: image.mimeType,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: receiptAnalysisJsonSchema,
        },
      });

      return parseGeminiResponse(response.text);
    },
  };
}

export function createGoogleGeminiReceiptAnalyzer(options: {
  apiKey: string;
  model: string;
}): ReceiptAnalyzer {
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required');
  }
  if (!model) {
    throw new Error('Gemini model is required');
  }

  const client = new GoogleGenAI({ apiKey });
  return createGeminiReceiptAnalyzer({
    client: {
      generateContent: (request) => client.models.generateContent(request),
    },
    model,
  });
}
