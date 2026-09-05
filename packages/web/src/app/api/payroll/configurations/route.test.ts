import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../server/errors';
import { createListPayrollConfigurationsHandler } from './route';

describe('GET /api/payroll/configurations', () => {
  it('uses the authenticated wallet and returns its configurations', async () => {
    const list = vi.fn(async () => []);
    const response = await createListPayrollConfigurationsHandler({
      resolveIdentity: vi.fn(async () => `0x${'a'.repeat(64)}`), list,
    })(new Request('https://tali.test/api/payroll/configurations'));
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith(`0x${'a'.repeat(64)}`);
    await expect(response.json()).resolves.toEqual({ configurations: [] });
  });

  it('returns a sanitized 401 without querying when the session is invalid', async () => {
    const list = vi.fn();
    const response = await createListPayrollConfigurationsHandler({
      resolveIdentity: vi.fn(async () => { throw new ServerError('authentication_required', 401, 'A valid wallet session is required'); }),
      list,
    })(new Request('https://tali.test/api/payroll/configurations'));
    expect(response.status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });
});
