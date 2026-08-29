import {
  EXPENSE_CATEGORIES,
  type CreateClaimRequest,
  type ExpenseCategory,
  type UncertainField,
} from '@tali/shared';
import { z } from 'zod';

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;
const SHA_256_HEX = /^[0-9a-f]{64}$/;
const BASE_UNIT_AMOUNT = /^[1-9]\d{0,29}$/;
const CURRENCY = /^[A-Z]{3}$/;
const RECEIPT_PATH = /^([0-9a-f-]{36})\/([0-9a-f]{64})\.(?:jpg|png|webp)$/;

export const eventIdSchema = z.string().uuid();
export const suiAddressSchema = z.string().regex(SUI_ADDRESS, 'invalid Sui address');

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

const trimmedString = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value === value.trim(), 'must already be trimmed');

const categorySchema = z.string().refine(
  (value): value is ExpenseCategory =>
    EXPENSE_CATEGORIES.includes(value as ExpenseCategory),
  'unsupported category',
);

const uncertainFields: readonly UncertainField[] = [
  'merchant',
  'amount',
  'receiptDate',
  'category',
];

const receiptAnalysisSchema = z
  .object({
    merchant: trimmedString(200).nullable(),
    amount: z.string().regex(BASE_UNIT_AMOUNT).nullable(),
    currency: z.string().regex(CURRENCY).nullable(),
    receiptDate: z.string().refine(isValidIsoDate).nullable(),
    category: categorySchema.nullable(),
    confidence: z.number().finite().min(0).max(1),
    uncertainFields: z
      .array(z.enum(uncertainFields as [UncertainField, ...UncertainField[]]))
      .max(4)
      .refine((values) => new Set(values).size === values.length),
    warnings: z.array(trimmedString(300)).max(20),
    receiptHash: z.string().regex(SHA_256_HEX),
    fuzzyKey: z.string().max(512),
  })
  .strict()
  .superRefine((analysis, context) => {
    const values: Record<UncertainField, unknown> = {
      merchant: analysis.merchant,
      amount: analysis.amount,
      receiptDate: analysis.receiptDate,
      category: analysis.category,
    };
    for (const field of uncertainFields) {
      if ((values[field] === null) !== analysis.uncertainFields.includes(field)) {
        context.addIssue({
          code: 'custom',
          path: ['uncertainFields'],
          message: `uncertainty does not match ${field}`,
        });
      }
    }
  });

const createClaimRequestSchema = z
  .object({
    eventId: eventIdSchema,
    submitter: suiAddressSchema,
    amount: z.string().regex(BASE_UNIT_AMOUNT),
    merchant: trimmedString(200),
    receiptDate: z.string().refine(isValidIsoDate, 'invalid receipt date'),
    category: categorySchema,
    description: z
      .string()
      .max(500)
      .refine((value) => value === value.trim(), 'must already be trimmed'),
    storagePath: z.string().regex(RECEIPT_PATH, 'invalid private receipt path'),
    analysis: receiptAnalysisSchema,
  })
  .strict()
  .superRefine((request, context) => {
    const pathMatch = RECEIPT_PATH.exec(request.storagePath);
    if (
      pathMatch?.[1] !== request.eventId ||
      pathMatch?.[2] !== request.analysis.receiptHash
    ) {
      context.addIssue({
        code: 'custom',
        path: ['storagePath'],
        message: 'receipt path must match event and analysis hash',
      });
    }

    const matchingFields = [
      ['amount', request.amount, request.analysis.amount],
      ['merchant', request.merchant, request.analysis.merchant],
      ['receiptDate', request.receiptDate, request.analysis.receiptDate],
      ['category', request.category, request.analysis.category],
    ] as const;
    for (const [field, claimValue, analysisValue] of matchingFields) {
      if (claimValue !== analysisValue) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} must match receipt analysis`,
        });
      }
    }

    const expectedFuzzyKey = [
      request.merchant.toLowerCase().replace(/\s+/g, ' '),
      request.receiptDate,
      request.amount,
    ].join('|');
    if (request.analysis.fuzzyKey !== expectedFuzzyKey) {
      context.addIssue({
        code: 'custom',
        path: ['analysis', 'fuzzyKey'],
        message: 'fuzzy key does not match normalized claim fields',
      });
    }
  });

export function parseCreateClaimRequest(input: unknown): CreateClaimRequest {
  return createClaimRequestSchema.parse(input) as CreateClaimRequest;
}
