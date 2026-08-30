import { describe, expect, it, vi } from 'vitest';

import { createServerSupabaseClient } from './client';

describe('createServerSupabaseClient', () => {
  it('uses the preferred server secret and disables browser session behavior', () => {
    const client = { marker: 'client' };
    const factory = vi.fn(() => client);

    expect(
      createServerSupabaseClient({
        env: {
          SUPABASE_URL: 'https://project.supabase.co',
          SUPABASE_SECRET_KEY: 'preferred-secret',
          SUPABASE_SERVICE_ROLE_KEY: 'legacy-secret',
        },
        factory,
      }),
    ).toBe(client);
    expect(factory).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'preferred-secret',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  });

  it('supports the legacy service-role name during migration', () => {
    const factory = vi.fn(() => ({ marker: 'client' }));

    createServerSupabaseClient({
      env: {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SECRET_KEY: '   ',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy-secret',
      },
      factory,
    });

    expect(factory).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'legacy-secret',
      expect.any(Object),
    );
  });

  it('fails closed when URL or server credentials are missing', () => {
    expect(() => createServerSupabaseClient({ env: {}, factory: vi.fn() })).toThrow(
      'SUPABASE_URL',
    );
    expect(() =>
      createServerSupabaseClient({
        env: { SUPABASE_URL: 'https://project.supabase.co' },
        factory: vi.fn(),
      }),
    ).toThrow('SUPABASE_SECRET_KEY');
  });
});
