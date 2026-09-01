import {
  createTestnetClient,
  readPayrollMandate,
  taliTestnetUsdcConfig,
} from '@tali/treasury-sui';

import type { EnvLike } from '../env';

/**
 * The floors the mandate is created with, in basis points.
 *
 * EPF is 2300 rather than 2400 because the employer rate steps from 13% to 12%
 * above RM5,000 of wages, and a floor of 2400 would refuse a correct split for
 * anyone earning more than that. SOCSO and EIS are measured against a wage
 * capped at RM6,000, which is why their floors can sit at the full rate.
 */
export const CONFIGURED_FLOOR_BPS = {
  epf: 2300n,
  socso: 225n,
  eis: 40n,
} as const;

export interface FloorReading {
  epfBps: bigint;
  /** Whether this came off the chain or is what the deploy intends to set. */
  source: 'chain' | 'configured';
}

/**
 * Prefers the mandate's own floor over the constant above.
 *
 * The enforcement screen tells the visitor the minimum EPF must receive. Once
 * a mandate exists, that sentence is a claim about a specific object, and
 * quoting a constant would let the screen name one number while the chain
 * enforces another.
 */
export async function readEpfFloor(env: EnvLike = process.env): Promise<FloorReading> {
  const mandateId = env.PAYROLL_MANDATE_ID?.trim();
  const packageId = env.PAYROLL_PACKAGE_ID?.trim();
  if (!mandateId || !packageId) {
    return { epfBps: CONFIGURED_FLOOR_BPS.epf, source: 'configured' };
  }

  try {
    const mandate = await readPayrollMandate(
      createTestnetClient(env.SUI_GRPC_URL),
      { ...taliTestnetUsdcConfig, packageId },
      mandateId,
    );
    const epf = mandate.floors[0];
    if (!epf) return { epfBps: CONFIGURED_FLOOR_BPS.epf, source: 'configured' };
    return { epfBps: epf.minBps, source: 'chain' };
  } catch {
    /* An unreadable mandate is not a reason to show nothing. The screen says
       which of the two it is quoting. */
    return { epfBps: CONFIGURED_FLOOR_BPS.epf, source: 'configured' };
  }
}
