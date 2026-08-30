import { describe, expect, it } from 'vitest';

import { requireDemoIdentityEnabled } from './demo-auth';

describe('requireDemoIdentityEnabled', () => {
  it('fails closed unless insecure demo identity is explicitly enabled', () => {
    expect(() => requireDemoIdentityEnabled({})).toThrowError(
      expect.objectContaining({ code: 'authentication_required', status: 503 }),
    );
    expect(() =>
      requireDemoIdentityEnabled({ TALI_ALLOW_INSECURE_DEMO_IDENTITY: 'false' }),
    ).toThrow();
  });

  it('allows the controlled demo API only for an exact true value', () => {
    expect(() =>
      requireDemoIdentityEnabled({ TALI_ALLOW_INSECURE_DEMO_IDENTITY: 'true' }),
    ).not.toThrow();
  });
});
