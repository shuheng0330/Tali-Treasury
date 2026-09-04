import { TreasuryDashboard } from '@/components/treasury/TreasuryDashboard';
import { DEMO_EVENT_ID } from '@/lib/demo-config';
import { createSupabaseEventMemberRepository } from '@/server/supabase/event-member-repository';
import { createServerSupabaseClient } from '@/server/supabase/client';
import { claimReviewsAreRecordable } from '@/server/claims/review-availability';
import { toMandateView } from '@tali/shared';
import {
  createTestnetClient,
  readMandate,
  taliTestnetUsdcConfig,
  taliUsdcDemo,
} from '@tali/treasury-sui';

export const metadata = {
  title: 'Treasury · Tali Treasury',
};

export const dynamic = 'force-dynamic';

/**
 * The treasurer recorded on the event, or null when it cannot be read.
 *
 * Null is a real answer rather than a failure: the dashboard falls back to the
 * build-time constant and the screen still renders. A treasurer label is not
 * worth a 500, and the server re-checks the wallet on every write regardless.
 */
async function readEventTreasurer(): Promise<string | null> {
  try {
    const members = createSupabaseEventMemberRepository(
      createServerSupabaseClient() as never,
    );
    return await members.findTreasurer(DEMO_EVENT_ID);
  } catch {
    return null;
  }
}

export default async function TreasuryPage() {
  const apiEnabled = true;
  const reviewsRecordable = await claimReviewsAreRecordable();
  const eventTreasurer = await readEventTreasurer();

  try {
    const client = createTestnetClient(process.env.SUI_GRPC_URL);
    const mandateId = process.env.TALI_MANDATE_ID ?? taliUsdcDemo.mandateId;
    const state = await readMandate(client, taliTestnetUsdcConfig, mandateId);

    return (
      <TreasuryDashboard
        apiEnabled={apiEnabled}
        reviewsRecordable={reviewsRecordable}
        initialMandate={toMandateView(state)}
        eventTreasurer={eventTreasurer}
      />
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown Sui read error';
    return (
      <TreasuryDashboard
        apiEnabled={apiEnabled}
        reviewsRecordable={reviewsRecordable}
        initialMandate={null}
        readError={message}
        eventTreasurer={eventTreasurer}
      />
    );
  }
}
