import { createServerSupabaseClient } from '../supabase/client';

const UNDEFINED_COLUMN = '42703';

/**
 * Whether a decision can be stored at all.
 *
 * The review columns arrive in a migration this app cannot apply itself, and
 * without them a review fails at the write, after the treasurer has already
 * decided. A screen that asks first can say so instead of offering a button
 * that always fails.
 *
 * Read on the server for each render: it is one round trip, and columns that
 * appear mid-demo should not need a restart to be noticed.
 */
export async function claimReviewsAreRecordable(): Promise<boolean> {
  try {
    const client = createServerSupabaseClient() as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          limit: (count: number) => Promise<{ error: { code?: string } | null }>;
        };
      };
    };
    const { error } = await client.from('claims').select('review_action').limit(1);
    return error?.code !== UNDEFINED_COLUMN;
  } catch {
    /* No Supabase configuration at all is a different failure, and the claim
       queue already says the backend is unreachable. Nothing is gained by
       also blaming a missing column for it. */
    return true;
  }
}
