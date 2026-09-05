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
        <h1 className="text-display">Your way in</h1>
        <p className="text-body text-ink-2">
          Connect your wallet and this page shows the screens that belong to you.
        </p>
      </header>

      <RoleChooser treasurer={treasurer} employee={employee} />

      {!reviewsRecordable ? (
        <p className="text-caption text-ink-3">
          Claim decisions cannot be saved right now. You can still read the queue.
        </p>
      ) : null}

      <p className="text-caption text-ink-3">
        Screens that are not yours are hidden, not locked. Every one of them still checks
        your wallet before it saves anything.
      </p>

      <Link href="/" className="link self-start">
        Back to the overview
      </Link>
    </div>
  );
}
