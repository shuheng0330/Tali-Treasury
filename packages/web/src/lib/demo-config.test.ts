import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('demo event selection', () => {
  it('preserves the historical event when overrides are empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_EVENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_DEMO_EVENT_NAME', '');
    vi.stubEnv('NEXT_PUBLIC_SINGLE_WALLET_DEMO', 'false');
    const config = await import('./demo-config');
    expect(config.DEMO_EVENT_ID).toBe('ba7e50e2-7e7b-4a67-a505-9e3a329739ae');
    expect(config.DEMO_EVENT_NAME).toBe('Orientation Week');
    expect(config.SINGLE_WALLET_DEMO).toBe(false);
  });

  it('selects a separate event and enables the explicit demo disclosure', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_EVENT_ID', '223d1aa1-2c95-449d-94b3-36083c83016c');
    vi.stubEnv('NEXT_PUBLIC_DEMO_EVENT_NAME', 'Single-wallet reimbursement demo');
    vi.stubEnv('NEXT_PUBLIC_SINGLE_WALLET_DEMO', 'true');
    const config = await import('./demo-config');
    expect(config.DEMO_EVENT_ID).toBe('223d1aa1-2c95-449d-94b3-36083c83016c');
    expect(config.DEMO_EVENT_NAME).toBe('Single-wallet reimbursement demo');
    expect(config.SINGLE_WALLET_DEMO).toBe(true);
  });
});
