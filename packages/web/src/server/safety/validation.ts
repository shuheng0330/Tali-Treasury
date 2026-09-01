import { z } from 'zod';

const SUI_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;
const BASE_UNIT_AMOUNT = /^[0-9]{1,30}$/;

/** Testnet USDC, but still a real transfer. Keep a deliberate attack small. */
const MAX_ATTACK_AMOUNT = 1_000_000_000n;

export const safetyAttackSchema = z
  .object({
    attack: z.enum(['overspend', 'unknown_recipient', 'after_revocation', 'drain_budget', 'custom']),
    amount: z
      .string()
      .regex(BASE_UNIT_AMOUNT, 'amount must be base units')
      .refine((value) => BigInt(value) > 0n, 'amount must be greater than zero')
      .refine((value) => BigInt(value) <= MAX_ATTACK_AMOUNT, 'amount is too large for a test'),
    recipient: z.string().regex(SUI_ADDRESS, 'invalid Sui address'),
  })
  .strict();
