import { z } from 'zod';

const SUI_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;
const BASE_UNIT_AMOUNT = /^[0-9]{1,30}$/;

/** RM200,000 a month in base units. Past this it is a typo, not a salary. */
const MAX_GROSS = 200_000_000_000n;

/**
 * RM100 a month. Below this the EPF band arithmetic stops describing a salary:
 * the schedule's narrowest band is RM20, so the employee contribution is a
 * share of RM20 however small the wage, and by about RM10 that already exceeds
 * the share of gross the mandate requires the worker to keep.
 */
const MIN_GROSS = 100_000_000n;

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
    /**
     * Present only on the enforcement screen, which deliberately underpays a
     * body to show the contract refusing it. Named rather than boolean so the
     * request says which body, and so it cannot be set by accident.
     */
    underpay: z.enum(['epf', 'socso', 'eis']).optional(),
  })
  .strict();

export type PayrollRequest = z.infer<typeof payrollRequestSchema>;
