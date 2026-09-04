import type { SalaryStreamView } from '@tali/shared';
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../../server/errors';
import { createWithdrawHandler } from './route';

const origin = 'https://tali-treasury.vercel.app';
const employee = `0x${'a'.repeat(64)}`;
const stream: SalaryStreamView = {
  id: `0x${'1'.repeat(64)}`,
  mandateId: `0x${'2'.repeat(64)}`,
  employee,
  totalAmount: '3000000000',
  startedAtMs: 1_000,
  endsAtMs: 2_000,
  withdrawn: '0',
  accrued: '1000',
  available: '1000',
};

function request(requestOrigin = origin) {
  return new Request(`${origin}/api/streams/${stream.id}/withdraw`, {
    method: 'POST',
    headers: { origin: requestOrigin },
  });
}

function context(id = stream.id) {
  return { params: Promise.resolve({ id }) };
}

describe('salary stream withdrawal authorization', () => {
  it('reads ownership before withdrawing for the employee', async () => {
    const calls: string[] = [];
    const read = vi.fn(async () => {
      calls.push('read');
      return stream;
    });
    const withdraw = vi.fn(async () => {
      calls.push('withdraw');
      return { ok: true as const, digest: 'digest', amount: '1000' };
    });

    const response = await createWithdrawHandler({
      read,
      withdraw,
      resolveIdentity: vi.fn(async () => employee),
      appOrigin: origin,
    })(request(), context());

    expect(response.status).toBe(200);
    expect(calls).toEqual(['read', 'withdraw']);
  });

  it.each([
    ['employer', `0x${'b'.repeat(64)}`],
    ['unrelated wallet', `0x${'c'.repeat(64)}`],
  ])('rejects the %s without withdrawing', async (_label, actor) => {
    const withdraw = vi.fn();
    const response = await createWithdrawHandler({
      read: vi.fn(async () => stream),
      withdraw,
      resolveIdentity: vi.fn(async () => actor),
      appOrigin: origin,
    })(request(), context());

    expect(response.status).toBe(403);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('rejects a foreign origin before reading the stream', async () => {
    const read = vi.fn();
    const resolveIdentity = vi.fn(async () => employee);
    const response = await createWithdrawHandler({
      read,
      withdraw: vi.fn(),
      resolveIdentity,
      appOrigin: origin,
    })(request('https://evil.example'), context());

    expect(response.status).toBe(403);
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('requires a session before reading the stream', async () => {
    const read = vi.fn();
    const response = await createWithdrawHandler({
      read,
      withdraw: vi.fn(),
      resolveIdentity: vi.fn(async () => {
        throw new ServerError(
          'authentication_required',
          401,
          'A valid wallet session is required',
        );
      }),
      appOrigin: origin,
    })(request(), context());

    expect(response.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects a missing stream id', async () => {
    const read = vi.fn();
    const response = await createWithdrawHandler({
      read,
      withdraw: vi.fn(),
      resolveIdentity: vi.fn(async () => employee),
      appOrigin: origin,
    })(request(), context(''));

    expect(response.status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });

  it('returns a safe not-found response without withdrawing', async () => {
    const withdraw = vi.fn();
    const response = await createWithdrawHandler({
      read: vi.fn(async () => {
        throw new ServerError('stream_not_found', 404, 'Salary stream not found');
      }),
      withdraw,
      resolveIdentity: vi.fn(async () => employee),
      appOrigin: origin,
    })(request(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'stream_not_found' });
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('preserves a contract refusal as an HTTP 200 result', async () => {
    const response = await createWithdrawHandler({
      read: vi.fn(async () => stream),
      withdraw: vi.fn(async () => ({
        ok: false as const,
        abortCode: 12,
        message: 'Nothing is available to withdraw',
      })),
      resolveIdentity: vi.fn(async () => employee),
      appOrigin: origin,
    })(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: false, abortCode: 12 });
  });
});
