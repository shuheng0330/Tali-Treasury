import type { Claim } from '@tali/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ReviewActionDialog } from '../components/treasury/ReviewActionDialog';

const claim = {
  id: 'claim-id',
  eventId: 'event-id',
  submitter: `0x${'a'.repeat(64)}`,
  submitterName: 'Lim Wey Cheng',
  state: 'awaiting_review',
  amount: '1000000',
  merchant: 'Campus Print Shop',
  receiptDate: '2026-08-31',
  category: 'printing',
  description: '',
  receiptUrl: null,
  receiptHash: 'a'.repeat(64),
  analysis: null,
  decision: null,
  review: null,
  payment: null,
  createdAtMs: 1,
  updatedAtMs: 1,
} satisfies Claim;

describe('ReviewActionDialog', () => {
  it('renders the approval payment warning without a reason field', () => {
    const html = renderToStaticMarkup(
      <ReviewActionDialog
        action="approve"
        claim={claim}
        pending={false}
        serverError={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain('Sui Testnet USDC payment');
    expect(html).toContain('Approve and pay');
    expect(html).not.toContain('<textarea');
  });

  it('renders a required reason field and sanitized server error for correction', () => {
    const html = renderToStaticMarkup(
      <ReviewActionDialog
        action="request_correction"
        claim={claim}
        pending={true}
        serverError="The review action could not be completed."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain('<textarea');
    expect(html).toContain('Required · stored in the audit record');
    expect(html).toContain('Request correction…');
    expect(html).toContain('The review action could not be completed.');
  });
});
