import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ReviewClaimRequest,
  type UncertainField,
} from '@tali/shared';
import { z } from 'zod';

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;
const SHA_256_HEX = /^[0-9a-f]{64}$/;
const BASE_UNIT_AMOUNT = /^[1-9]\d{0,29}$/;
const CURRENCY = /^(?:[A-Z]{3}|USDC)$/;

export const eventIdSchema = z.string().uuid();
export const claimIdSchema = z.string().uuid();
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

const createClaimInputSchema = z
  .object({
    draftId: z.string().uuid(),
    submitter: suiAddressSchema,
    amount: z.string().regex(BASE_UNIT_AMOUNT),
    merchant: trimmedString(200),
    receiptDate: z.string().refine(isValidIsoDate, 'invalid receipt date'),
    category: categorySchema,
    description: z
      .string()
      .max(500)
      .refine((value) => value === value.trim(), 'must already be trimmed'),
  })
  .strict();

export function parseCreateClaimInput(input: unknown): {
  draftId: string;
  submitter: string;
  amount: string;
  merchant: string;
  receiptDate: string;
  category: ExpenseCategory;
  description: string;
} {
  return createClaimInputSchema.parse(input);
}

/*
 * A correction restates the figures, so it has to hold them to the same rules
 * the original submission did. Built from the same pieces rather than a second
 * set: a looser copy here let a date the create path refuses through the
 * correction path instead.
 */
const resubmitClaimInputSchema = z
  .object({
    claimId: claimIdSchema,
    submitter: suiAddressSchema,
    amount: z.string().regex(BASE_UNIT_AMOUNT, 'amount must be base units above zero'),
    merchant: trimmedString(200),
    receiptDate: z.string().refine(isValidIsoDate, 'invalid receipt date'),
    category: categorySchema,
    description: z
      .string()
      .max(500)
      .refine((value) => value === value.trim(), 'must already be trimmed'),
  })
  .strict();

export function parseResubmitClaimInput(input: unknown): {
  claimId: string;
  submitter: string;
  amount: string;
  merchant: string;
  receiptDate: string;
  category: ExpenseCategory;
  description: string;
} {
  return resubmitClaimInputSchema.parse(input);
}

const processClaimInputSchema = z
  .object({
    claimId: claimIdSchema,
    processor: suiAddressSchema,
  })
  .strict();

export function parseProcessClaimInput(input: unknown): {
  claimId: string;
  processor: string;
} {
  return processClaimInputSchema.parse(input);
}

const reviewBase = {
  claimId: claimIdSchema,
  reviewer: suiAddressSchema,
};

const reviewClaimInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...reviewBase,
      action: z.literal('approve'),
      reason: trimmedString(500).optional(),
    })
    .strict(),
  z
    .object({
      ...reviewBase,
      action: z.literal('reject'),
      reason: trimmedString(500),
    })
    .strict(),
  z
    .object({
      ...reviewBase,
      action: z.literal('request_correction'),
      reason: trimmedString(500),
    })
    .strict(),
]);

export function parseReviewClaimInput(input: unknown):
  | { claimId: string; action: 'approve'; reviewer: string; reason?: string }
  | { claimId: string; action: 'reject'; reviewer: string; reason: string }
  | { claimId: string; action: 'request_correction'; reviewer: string; reason: string } {
  return reviewClaimInputSchema.parse(input);
}
