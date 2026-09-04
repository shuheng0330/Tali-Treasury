import { afterEach, describe, expect, it, vi } from 'vitest';

import { tryRegisterPayroll } from './payroll-registration';

afterEach(() => vi.unstubAllGlobals());

describe('tryRegisterPayroll', () => {
  it('sends only the funded digest and returns registered object ids', async () => {
    const digest = '4'.repeat(44);
    const payload = {
      status: 'registered',
      mandateId: `0x${'a'.repeat(64)}`,
      capId: `0x${'b'.repeat(64)}`,
    };
    const fetchMock = vi.fn(async () => Response.json(payload, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(tryRegisterPayroll(digest)).resolves.toEqual({
      kind: 'registered',
      mandateId: payload.mandateId,
      capId: payload.capId,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/payroll/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ digest }),
    });
  });

  it('keeps pending and permanent verification messages distinct', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      error: 'payroll_registration_pending',
      message: 'The payroll transaction is not finalized yet. Retry registration shortly.',
    }, { status: 409 })));
    await expect(tryRegisterPayroll('4'.repeat(44))).resolves.toEqual({
      kind: 'unavailable',
      reason: 'the payroll transaction is not finalized yet. Retry registration shortly.',
    });

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      error: 'payroll_registration_refused',
      message: 'The transaction does not create a supported payroll',
    }, { status: 422 })));
    await expect(tryRegisterPayroll('4'.repeat(44))).resolves.toEqual({
      kind: 'unavailable',
      reason: 'the transaction does not create a supported payroll',
    });
  });
});
