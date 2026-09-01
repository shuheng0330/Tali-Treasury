import { taliUsdcDemo } from '@tali/treasury-sui';

export const DEMO_EVENT_ID = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
export const DEMO_EVENT_NAME = 'Orientation Week';
export const DEMO_SUBMITTER = taliUsdcDemo.approvedMember;
export const DEMO_TREASURER = taliUsdcDemo.treasurer;

/**
 * Payroll object ids, empty until the payroll module is published and the
 * mandate and stream exist. Reading them from the environment first means the
 * ids can be set without a code change; `taliPayrollDemo` replaces the empty
 * defaults once `@tali/treasury-sui` exports it.
 */
export const PAYROLL_MANDATE_ID = process.env.NEXT_PUBLIC_PAYROLL_MANDATE_ID ?? '';
export const DEMO_STREAM_ID = process.env.NEXT_PUBLIC_DEMO_STREAM_ID ?? '';

/** True once both exist, which is what the screens key their banners off. */
export const PAYROLL_CONFIGURED =
  PAYROLL_MANDATE_ID !== '' && DEMO_STREAM_ID !== '';
