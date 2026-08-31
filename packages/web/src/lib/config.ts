import { taliUsdcDemo } from '@tali/treasury-sui';

/**
 * The event seeded by supabase/migrations/20260831000000_seed_demo_event.sql.
 * The API validates this as a UUID, so the old 'orientation-week' slug the mock
 * uses for its own bookkeeping cannot be sent to the backend.
 */
export const DEMO_EVENT_ID =
  process.env.NEXT_PUBLIC_DEMO_EVENT_ID ?? 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';

/**
 * Who the browser claims to be until wallet authentication exists. The same
 * address is the mandate's approved recipient on chain and an active member of
 * the demo event in the database, which is what makes both sides agree.
 */
export const DEMO_VIEWER = taliUsdcDemo.approvedMember;
