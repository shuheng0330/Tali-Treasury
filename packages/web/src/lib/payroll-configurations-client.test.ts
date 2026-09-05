import { describe, expect, it, vi } from 'vitest';

import { loadPayrollConfigurations } from './payroll-configurations-client';

describe('loadPayrollConfigurations', () => {
  it('distinguishes an expired wallet session from a payroll loading failure', async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'authentication_required' } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    ));

    await expect(loadPayrollConfigurations(fetcher as typeof fetch))
      .resolves.toEqual({ status: 'unauthorized' });
  });
});
