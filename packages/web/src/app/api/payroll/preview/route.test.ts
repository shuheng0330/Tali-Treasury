import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../server/errors';
import { createPayrollPreviewPostHandler } from './route';

const employer = `0x${'a'.repeat(64)}`;
const payload = {
  mandateId: `0x${'b'.repeat(64)}`,
  gross: '30000000',
  age: 30,
  citizenship: 'local' as const,
};

const origin = 'http://localhost:3000';

function request(requestOrigin = origin) {
  return new Request(`${origin}/api/payroll/preview`, {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('payroll preview POST authorization', () => {
  it('returns a live preview for the authenticated employer without insecure demo identity', async () => {
    const preview = vi.fn(async () => ({ currency: 'USDC' }));
    const response = await createPayrollPreviewPostHandler({
      preview,
      resolveIdentity: vi.fn(async () => employer),
      appOrigin: origin,
      env: {
        TALI_ALLOW_INSECURE_DEMO_IDENTITY: 'false',
        TALI_EMPLOYER_WALLET: employer,
      },
    })(request());

    expect(response.status).toBe(200);
    expect(preview).toHaveBeenCalledWith(employer, payload);
  });

  it('does not preview for another wallet', async () => {
    const preview = vi.fn();
    const response = await createPayrollPreviewPostHandler({
      preview,
      resolveIdentity: vi.fn(async () => `0x${'c'.repeat(64)}`),
      appOrigin: origin,
      env: { TALI_EMPLOYER_WALLET: employer },
    })(request());

    expect(response.status).toBe(403);
    expect(preview).not.toHaveBeenCalled();
  });

  it('does not parse or preview without a wallet session', async () => {
    const preview = vi.fn();
    const response = await createPayrollPreviewPostHandler({
      preview,
      resolveIdentity: vi.fn(async () => {
        throw new ServerError('authentication_required', 401, 'A valid wallet session is required');
      }),
      appOrigin: origin,
      env: { TALI_EMPLOYER_WALLET: employer },
    })(request());

    expect(response.status).toBe(401);
    expect(preview).not.toHaveBeenCalled();
  });

  it('does not preview for a foreign origin', async () => {
    const preview = vi.fn();
    const resolveIdentity = vi.fn(async () => employer);
    const response = await createPayrollPreviewPostHandler({
      preview,
      resolveIdentity,
      appOrigin: origin,
      env: { TALI_EMPLOYER_WALLET: employer },
    })(request('https://evil.example'));

    expect(response.status).toBe(403);
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
  });
});
