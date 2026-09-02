import { createServerSupabaseClient } from '../supabase/client';

const UNDEFINED_COLUMN = '42703';

/**
 * Whether a decision can be stored at all.
 *
 * `claims.review` arrives in a migration this app cannot apply itself, and
 * without the column the repository refuses a review rather than changing a
 * claim's state with no record of who changed it or why. A screen that asked
 * first can say so instead of offering a button that always fails.
 *
 * Read on the server for each render: it is one round trip, and a column that
 * appears mid-demo should not need a restart to be noticed.
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
    const { error } = await client.from('claims').select('review').limit(1);
    return error?.code !== UNDEFINED_COLUMN;
  } catch {
    /* No Supabase configuration at all is a different failure, and the claim
       queue already says the backend is unreachable. Nothing is gained by
       also blaming a missing column for it. */
    return true;
  }
}
