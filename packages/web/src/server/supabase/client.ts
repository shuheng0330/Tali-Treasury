import { createClient } from '@supabase/supabase-js';

type SupabaseFactory = (
  url: string,
  key: string,
  options: {
    auth: {
      persistSession: false;
      autoRefreshToken: false;
      detectSessionInUrl: false;
    };
  },
) => unknown;

export function createServerSupabaseClient(options?: {
  env?: Record<string, string | undefined>;
  factory?: SupabaseFactory;
}): ReturnType<SupabaseFactory> {
  const env = options?.env ?? process.env;
  const url = env.SUPABASE_URL?.trim();
  const secret =
    env.SUPABASE_SECRET_KEY?.trim() ||
    env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    throw new Error('SUPABASE_URL is required');
  }
  if (!secret) {
    throw new Error(
      'SUPABASE_SECRET_KEY is required (SUPABASE_SERVICE_ROLE_KEY is supported temporarily)',
    );
  }

  const factory = options?.factory ?? createClient;
  return factory(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
