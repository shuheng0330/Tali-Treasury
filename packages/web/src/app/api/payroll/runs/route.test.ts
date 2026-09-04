import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../server/errors';
import { createPayrollRunsPostHandler } from './route';

const employer = `0x${'a'.repeat(64)}`;
const origin = 'https://tali-treasury.vercel.app';
const payload = {
  employee: `0x${'b'.repeat(64)}`,
  gross: '100000000',
  age: 25,
  citizenship: 'local' as const,
};

function request(requestOrigin = origin) {
  return new Request(`${origin}/api/payroll/runs`, {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('payroll runs POST authorization', () => {
  it('runs payroll for the configured employer', async () => {
    const run = vi.fn(async () => ({ id: 'run-1' }));
    const response = await createPayrollRunsPostHandler({
      run,
      resolveIdentity: vi.fn(async () => employer),
      appOrigin: origin,
      env: { TALI_EMPLOYER_WALLET: employer },
    })(request());

    expect(response.status).toBe(201);
    expect(run).toHaveBeenCalledWith(payload);
  });

  it('does not run payroll for another wallet', async () => {
    const run = vi.fn();
    const response = await createPayrollRunsPostHandler({
      run,
      resolveIdentity: vi.fn(async () => `0x${'c'.repeat(64)}`),
      appOrigin: origin,
      env: { TALI_EMPLOYER_WALLET: employer },
    })(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
    expect(run).not.toHaveBeenCalled();
  });

  it('does not parse or run after authentication failure', async () => {
    const run = vi.fn();
    const response = await createPayrollRunsPostHandler({
      run,
      resolveIdentity: vi.fn(async () => {
        throw new ServerError(
          'authentication_required',
          401,
          'A valid wallet session is required',
        );
      }),
      appOrigin: origin,
      env: { TALI_EMPLOYER_WALLET: employer },
    })(request());

    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('does not run payroll for a foreign origin', async () => {
    const run = vi.fn();
    const resolveIdentity = vi.fn(async () => employer);
    const response = await createPayrollRunsPostHandler({
      run,
      resolveIdentity,
      appOrigin: origin,
      env: { TALI_EMPLOYER_WALLET: employer },
    })(request('https://evil.example'));

    expect(response.status).toBe(403);
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('fails closed when the employer wallet is not configured', async () => {
    const run = vi.fn();
    const response = await createPayrollRunsPostHandler({
      run,
      resolveIdentity: vi.fn(async () => employer),
      appOrigin: origin,
      env: {},
    })(request());

    expect(response.status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });
});
