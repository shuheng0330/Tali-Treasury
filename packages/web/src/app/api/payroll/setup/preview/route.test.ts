import { describe, expect, it, vi } from 'vitest';

import { createPayrollSetupPreviewHandler } from './route';

const employee = `0x${'b'.repeat(64)}`;
const employer = `0x${'a'.repeat(64)}`;

function request(body: string, origin = 'https://tali.example') {
  return new Request('https://tali.example/api/payroll/setup/preview', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/payroll/setup/preview', () => {
  it('uses the authenticated wallet instead of accepting an employer from the body', async () => {
    const preview = vi.fn(async (input) => ({ employer: input.identity }));
    const handler = createPayrollSetupPreviewHandler({
      appOrigin: 'https://tali.example',
      resolveIdentity: vi.fn(async () => employer),
      preview,
    });

    const response = await handler(request(JSON.stringify({
      employee,
      expiryMs: 2_000_000_000_000,
    })));

    expect(response.status).toBe(200);
    expect(preview).toHaveBeenCalledWith({
      identity: employer,
      employee,
      expiryMs: 2_000_000_000_000,
    });
  });

  it('rejects a cross-origin request before resolving the wallet', async () => {
    const resolveIdentity = vi.fn(async () => employer);
    const handler = createPayrollSetupPreviewHandler({
      appOrigin: 'https://tali.example',
      resolveIdentity,
      preview: vi.fn(),
    });

    const response = await handler(request('{}', 'https://attacker.example'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'origin_forbidden' });
    expect(resolveIdentity).not.toHaveBeenCalled();
  });

  it('rejects malformed input before generating a preview', async () => {
    const preview = vi.fn();
    const handler = createPayrollSetupPreviewHandler({
      appOrigin: 'https://tali.example',
      resolveIdentity: vi.fn(async () => employer),
      preview,
    });

    const response = await handler(request(JSON.stringify({ employee: 'not-an-address' })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_request' });
    expect(preview).not.toHaveBeenCalled();
  });
});
