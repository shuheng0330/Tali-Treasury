import { describe, expect, it, vi } from 'vitest';

import { createSalaryStreamRouteHandlers, type HandlerDependencies } from './route';

const origin = 'http://localhost:3000';
const employer = `0x${'1'.repeat(64)}`;
const mandateId = `0x${'2'.repeat(64)}`;

function deps(overrides: Partial<HandlerDependencies> = {}) {
  const stream = {
    streamId: `0x${'3'.repeat(64)}`,
    mandateId,
    employee: `0x${'4'.repeat(64)}`,
    totalAmount: '1000000',
    startedAtMs: 1,
    endsAtMs: 2,
    creationDigest: '5'.repeat(44),
    createdAtMs: 1,
  } as const;
  const value = {
    resolveIdentity: vi.fn(async () => employer),
    find: vi.fn(async () => null),
    open: vi.fn(async () => stream),
    appOrigin: origin,
    env: { TALI_EMPLOYER_WALLET: employer },
    ...overrides,
  } satisfies HandlerDependencies;
  return value;
}

describe('/api/payroll/streams', () => {
  it('returns the stream selected by an authorized payroll reader', async () => {
    const current = deps();
    const response = await createSalaryStreamRouteHandlers(current).get(
      new Request(`${origin}/api/payroll/streams?payroll=${mandateId}`),
    );
    expect(response.status).toBe(200);
    expect(current.find).toHaveBeenCalledWith(employer, mandateId);
  });

  it('rejects another wallet before opening or signing', async () => {
    const open = vi.fn();
    const current = deps({ resolveIdentity: vi.fn(async () => `0x${'9'.repeat(64)}`), open });
    const response = await createSalaryStreamRouteHandlers(current).post(new Request(
      `${origin}/api/payroll/streams`,
      {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ mandateId, totalAmount: '1000000', durationMinutes: 10 }),
      },
    ));
    expect(response.status).toBe(403);
    expect(open).not.toHaveBeenCalled();
  });

  it('opens a validated stream for the configured employer', async () => {
    const current = deps();
    const body = { mandateId, totalAmount: '1000000', durationMinutes: 10 };
    const response = await createSalaryStreamRouteHandlers(current).post(new Request(
      `${origin}/api/payroll/streams`,
      {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    ));
    expect(response.status).toBe(201);
    expect(current.open).toHaveBeenCalledWith(employer, body);
  });
});
