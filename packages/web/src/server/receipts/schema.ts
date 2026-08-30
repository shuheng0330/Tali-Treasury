import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ReceiptAnalysis,
  type UncertainField,
} from '@tali/shared';
import { z } from 'zod';

const SHA_256_HEX = /^[0-9a-f]{64}$/;
const DISPLAY_AMOUNT = /^\d{1,24}(?:\.\d{1,2})?$/;
const CURRENCY = /^[A-Za-z]{3}$/;
const uncertainFieldValues: readonly UncertainField[] = [
  'merchant',
  'amount',
  'receiptDate',
  'category',
];

export interface ParsedReceiptFields {
  merchant: string | null;
  amount: string | null;
  currency: string | null;
  receiptDate: string | null;
  category: ExpenseCategory | null;
  confidence: number;
  uncertainFields: UncertainField[];
  warnings: string[];
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const amountSchema = z
  .string()
  .trim()
  .regex(DISPLAY_AMOUNT, 'amount must have at most two decimal places')
  .transform((amount) => {
    const [whole, fraction = ''] = amount.split('.');
    return `${whole}.${fraction.padEnd(2, '0')}`;
  })
  .refine((amount) => BigInt(amount.replace('.', '')) > 0n, 'amount must be positive')
  .nullable();

const categorySchema = z
  .string()
  .refine(
    (value): value is ExpenseCategory =>
      EXPENSE_CATEGORIES.includes(value as ExpenseCategory),
    'unsupported expense category',
  )
  .nullable();

const uncertainFieldSchema = z.string().refine(
  (value): value is UncertainField =>
    uncertainFieldValues.includes(value as UncertainField),
  'unsupported uncertain field',
);

const receiptFieldsSchema = z
  .object({
    merchant: z.string().trim().min(1).max(200).nullable(),
    amount: amountSchema,
    currency: z
      .string()
      .trim()
      .regex(CURRENCY, 'currency must be a three-letter code')
      .transform((value) => value.toUpperCase())
      .nullable(),
    receiptDate: z.string().refine(isValidIsoDate, 'invalid receipt date').nullable(),
    category: categorySchema,
    confidence: z.number().finite().min(0).max(1),
    uncertainFields: z
      .array(uncertainFieldSchema)
      .max(4)
      .refine((values) => new Set(values).size === values.length, 'duplicate uncertainty'),
    warnings: z.array(z.string().trim().min(1).max(300)).max(20),
  })
  .strict()
  .superRefine((fields, context) => {
    const values: Record<UncertainField, unknown> = {
      merchant: fields.merchant,
      amount: fields.amount,
      receiptDate: fields.receiptDate,
      category: fields.category,
    };

    for (const field of uncertainFieldValues) {
      const marked = fields.uncertainFields.includes(field);
      if (values[field] === null && !marked) {
        context.addIssue({
          code: 'custom',
          path: ['uncertainFields'],
          message: `${field} must be marked uncertain when null`,
        });
      }
      if (values[field] !== null && marked) {
        context.addIssue({
          code: 'custom',
          path: ['uncertainFields'],
          message: `${field} cannot be marked uncertain when present`,
        });
      }
    }
  });

export function parseGeminiReceiptFields(input: unknown): ParsedReceiptFields {
  return receiptFieldsSchema.parse(input) as ParsedReceiptFields;
}

function toUsdcBaseUnits(displayAmount: string): string {
  const [whole, fraction] = displayAmount.split('.');
  return (
    BigInt(whole ?? '0') * 1_000_000n +
    BigInt(fraction ?? '00') * 10_000n
  ).toString();
}

function normalizeFuzzyPart(value: string | null): string {
  return value?.toLowerCase().replace(/\s+/g, ' ').trim() ?? '';
}

export function toReceiptAnalysis(
  fields: ParsedReceiptFields,
  receiptHash: string,
): ReceiptAnalysis {
  if (!SHA_256_HEX.test(receiptHash)) {
    throw new Error('receipt hash must be a lowercase SHA-256 digest');
  }

  const amount = fields.amount === null ? null : toUsdcBaseUnits(fields.amount);
  const fuzzyKey = [
    normalizeFuzzyPart(fields.merchant),
    fields.receiptDate ?? '',
    amount ?? '',
  ].join('|');

  return {
    ...fields,
    amount,
    receiptHash,
    fuzzyKey,
  };
}
