import { taliUsdcDemo } from '@tali/treasury-sui';

// Public event selection only; backend membership and treasurer checks still apply.
export const DEMO_EVENT_ID = process.env.NEXT_PUBLIC_DEMO_EVENT_ID || 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
export const DEMO_EVENT_NAME = process.env.NEXT_PUBLIC_DEMO_EVENT_NAME || 'Orientation Week';
export const SINGLE_WALLET_DEMO = process.env.NEXT_PUBLIC_SINGLE_WALLET_DEMO === 'true';
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

/**
 * The wallet allowed to run payroll, revoke a mandate and fire a safety
 * attempt. Must be the same address as the server's `TALI_EMPLOYER_WALLET`,
 * which is what actually decides; this only stops a control being offered to
 * somebody it would refuse. A Sui address is not a secret.
 */
export const EMPLOYER_WALLET = process.env.NEXT_PUBLIC_EMPLOYER_WALLET ?? '';

/**
 * The published payroll package, needed in the browser because Set Up Payroll
 * builds its transaction there. A package id names published bytecode and
 * authorises nothing, so it belongs on the public side of the boundary; the
 * signing key stays on the server and never gains a NEXT_PUBLIC_ prefix.
 */
export const PAYROLL_PACKAGE_ID = process.env.NEXT_PUBLIC_PAYROLL_PACKAGE_ID ?? '';

/**
 * The wallet the registered payroll is allowed to pay.
 *
 * Empty until the mandate exists. The payroll screens fall back to the sample
 * employee, which is fine while nothing can be signed, but a run addressed to
 * the sample wallet aborts once a mandate approving a different one is live.
 */
export const PAYROLL_EMPLOYEE = process.env.NEXT_PUBLIC_PAYROLL_EMPLOYEE ?? '';

/**
 * The backend signer. It is the default holder of the PayrollCap because the
 * server runs payroll on a schedule; the employer can send the capability
 * somewhere else, and the setup screen says what that would mean.
 */
export const AGENT_ADDRESS = process.env.NEXT_PUBLIC_AGENT_ADDRESS ?? '';

/** True once both exist, which is what the screens key their banners off. */
export const PAYROLL_CONFIGURED =
  PAYROLL_MANDATE_ID !== '' && DEMO_STREAM_ID !== '';
