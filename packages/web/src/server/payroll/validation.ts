import { z } from 'zod';

const SUI_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;
const BASE_UNIT_AMOUNT = /^[0-9]{1,30}$/;

/** RM200,000 a month in base units. Past this it is a typo, not a salary. */
const MAX_GROSS = 200_000_000_000n;

/** RM20 is the narrowest supported EPF wage band and permits the scaled demo. */
const MIN_GROSS = 20_000_000n;

export const payrollRequestSchema = z
  .object({
    employee: z.string().regex(SUI_ADDRESS, 'invalid Sui address'),
    gross: z
      .string()
      .regex(BASE_UNIT_AMOUNT, 'gross must be base units')
      .refine((value) => BigInt(value) > 0n, 'gross must be greater than zero')
      .refine((value) => BigInt(value) >= MIN_GROSS, 'gross is too small to be a monthly wage')
      .refine((value) => BigInt(value) <= MAX_GROSS, 'gross is implausibly large'),
    age: z.number().int().min(16).max(100),
    citizenship: z.enum(['local', 'foreign']),
    fxApproval: z
      .object({
        myrPerUsd: z.string().regex(/^\d{1,3}(?:\.\d{1,12})?$/, 'invalid MYR/USD rate'),
        rateTimestampMs: z.number().int().positive(),
      })
      .strict()
      .optional(),
    /**
     * Present only on the enforcement screen, which deliberately underpays a
     * body to show the contract refusing it. Named rather than boolean so the
     * request says which body, and so it cannot be set by accident.
     */
    underpay: z.enum(['epf', 'socso', 'eis']).optional(),
  })
  .strict();

export type PayrollRequest = z.infer<typeof payrollRequestSchema>;
