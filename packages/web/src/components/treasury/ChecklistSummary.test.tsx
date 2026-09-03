import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChecklistSummary, type AnnotatedCheck } from './ChecklistSummary';

function check(overrides: Partial<AnnotatedCheck> = {}): AnnotatedCheck {
  return {
    rule: 'per_claim_max',
    label: 'Per-claim cap',
    detail: '2.50 USDC against a 5.00 USDC cap',
    passed: true,
    notEvaluated: false,
    ...overrides,
  };
}

describe('ChecklistSummary', () => {
  it('collapses a fully passing claim to one line', () => {
    const html = renderToStaticMarkup(
      <ChecklistSummary checks={[check(), check({ rule: 'mandate_active', label: 'Mandate active' })]} />,
    );

    expect(html).toContain('All 2 checks passed');
    expect(html).toContain('Show details');
    expect(html).not.toContain('Per-claim cap');
  });

  it('shows only what needs attention, not every passing check', () => {
    const html = renderToStaticMarkup(
      <ChecklistSummary
        checks={[
          check({ rule: 'mandate_active', label: 'Mandate active' }),
          check({
            rule: 'confidence_sufficient',
            label: 'Receipt ready for payment',
            passed: false,
            detail: 'Receipt extraction is missing, uncertain, warned, or below the routing threshold',
          }),
        ]}
      />,
    );

    expect(html).toContain('Receipt ready for payment');
    expect(html).toContain('+1 more check passed');
    expect(html).toContain('Show all');
    expect(html).not.toContain('Mandate active');
  });

  it('names a check that could not be evaluated apart from one that failed', () => {
    const html = renderToStaticMarkup(
      <ChecklistSummary
        checks={[
          check({
            rule: 'total_budget',
            label: 'Budget remaining',
            notEvaluated: true,
            detail: 'Checked after an explicit USDC conversion quote is attached',
          }),
        ]}
      />,
    );

    expect(html).toContain('Budget remaining');
    expect(html).not.toContain('checks passed');
  });
});
