import type { Claim } from '@tali/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { PaymentReconciliationStatus } from './PaymentReconciliationStatus';

const digest = '4'.repeat(44);
const claim = {
  id: 'claim-id',
  state: 'paying',
  paymentAttempt: {
    digest,
    preparedAtMs: Date.parse('2026-09-02T12:00:00.000Z'),
    lastCheckedAtMs: null,
  },
  payment: null,
} as Claim;

describe('PaymentReconciliationStatus', () => {
  it('shows the durable digest and an enabled check action for paying', () => {
    const html = renderToStaticMarkup(
      <PaymentReconciliationStatus claim={claim} pending={false} onCheck={vi.fn()} />,
    );

    expect(html).toContain('Check payment status');
    expect(html).toContain(digest.slice(0, 10));
    expect(html).toContain(digest.slice(-8));
    expect(html).not.toContain('disabled');
  });

  it('disables the action and announces checking while pending', () => {
    const html = renderToStaticMarkup(
      <PaymentReconciliationStatus claim={claim} pending onCheck={vi.fn()} />,
    );

    expect(html).toContain('Checking Sui');
    expect(html).toContain('disabled');
  });

  it('links a settled payment to the real Testnet transaction', () => {
    const paid = {
      ...claim,
      state: 'paid' as const,
      payment: { digest },
    } as Claim;
    const html = renderToStaticMarkup(
      <PaymentReconciliationStatus claim={paid} pending={false} onCheck={vi.fn()} />,
    );

    expect(html).toContain(`https://suiscan.xyz/testnet/tx/${digest}`);
    expect(html).toContain('View transaction');
    expect(html).not.toContain('Check payment status');
  });
});
