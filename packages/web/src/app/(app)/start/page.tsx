import Link from 'next/link';

import { RoleChooser } from '@/components/RoleChooser';
import { DEMO_EVENT_ID } from '@/lib/demo-config';
import { claimReviewsAreRecordable } from '@/server/claims/review-availability';
import { createServerSupabaseClient } from '@/server/supabase/client';
import { createSupabaseEventMemberRepository } from '@/server/supabase/event-member-repository';
import { DEMO_STREAM_ID, getStreamService } from '@/server/streams/dependencies';

export const metadata = {
  title: 'Where to start · Tali Treasury',
};

/* Both authorities are read at request time and neither is baked in. */
export const dynamic = 'force-dynamic';

/**
 * Null is a real answer rather than a failure, exactly as on the treasury
 * screen: the chooser says it cannot check rather than guessing, and the
 * server re-checks every write regardless.
 */
async function readTreasurer(): Promise<string | null> {
  try {
    const members = createSupabaseEventMemberRepository(
      createServerSupabaseClient() as never,
    );
    return await members.findTreasurer(DEMO_EVENT_ID);
  } catch {
    return null;
  }
}

async function readStreamEmployee(): Promise<string | null> {
  try {
    const stream = await getStreamService().read(DEMO_STREAM_ID);
    return stream.employee;
  } catch {
    return null;
  }
}

export default async function StartPage() {
  const [treasurer, employee] = await Promise.all([
    readTreasurer(),
    readStreamEmployee(),
  ]);
  /* Read only so an unreachable database does not leave the page claiming a
     queue is ready to work when it is not. */
  const reviewsRecordable = await claimReviewsAreRecordable().catch(() => false);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Where to start</p>
        <h1 className="text-display">Four ways in</h1>
        <p className="text-body text-ink-2">
          Tali has an employer, a treasurer, the people being paid and the people
          claiming expenses. They see different screens. Connect a wallet and this page
          says which of them you are.
        </p>
      </header>

      <RoleChooser treasurer={treasurer} employee={employee} />

      {!reviewsRecordable ? (
        <p className="text-caption text-ink-3">
          Claim decisions cannot be recorded right now, so the treasurer queue is
          readable but its review controls will not save.
        </p>
      ) : null}

      <p className="text-caption text-ink-3">
        Nothing here is hidden by role. Every screen is reachable by URL, and each one
        checks the wallet itself before it writes anything.
      </p>

      <Link href="/" className="link self-start">
        Back to the overview
      </Link>
    </div>
  );
}
