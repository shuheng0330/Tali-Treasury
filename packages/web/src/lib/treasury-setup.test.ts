import { describe, expect, it } from 'vitest';
import {
  expiryMsFromDays,
  recipientList,
  treasuryAmounts,
  treasuryProblems,
  type TreasuryFormValue,
} from './treasury-setup';

const A = '0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e';
const B = '0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9';
const AGENT = '0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471';

const NOW = 1_757_000_000_000;

function form(overrides: Partial<TreasuryFormValue> = {}): TreasuryFormValue {
  return {
    name: 'Orientation Week',
    organisation: 'FSKTM',
    categories: ['food', 'printing'],
    budgetUsdc: '20.00',
    maxPerClaimUsdc: '5.00',
    expiryDays: '30',
    recipients: `${A}\n${B}`,
    agent: AGENT,
    ...overrides,
  };
}

describe('recipientList', () => {
  it('splits on newlines and commas and drops blanks', () => {
    expect(recipientList(`${A}\n\n , ${B} ,`)).toEqual([A, B]);
  });
});

describe('treasuryProblems', () => {
  it('accepts a complete treasury', () => {
    expect(treasuryProblems(form(), NOW)).toEqual({});
  });

  it('requires a name, an organisation and a category', () => {
    expect(treasuryProblems(form({ name: '  ' }), NOW).name).toBeDefined();
    expect(treasuryProblems(form({ organisation: '' }), NOW).organisation).toBeDefined();
    expect(treasuryProblems(form({ categories: [] }), NOW).categories).toBeDefined();
  });

  it('refuses a per-claim cap larger than the budget', () => {
    const problems = treasuryProblems(
      form({ budgetUsdc: '20', maxPerClaimUsdc: '25' }),
      NOW,
    );
    expect(problems.maxPerClaimUsdc).toBe(
      'One claim cannot be allowed to spend more than the whole budget.',
    );
  });

  it('refuses more decimals than USDC can carry', () => {
    expect(treasuryProblems(form({ budgetUsdc: '20.1234567' }), NOW).budgetUsdc).toBeDefined();
  });

  it('refuses a budget too small to pay anything', () => {
    expect(treasuryProblems(form({ budgetUsdc: '0.5' }), NOW).budgetUsdc).toBeDefined();
  });

  it('refuses an empty, malformed or duplicated recipient list', () => {
    expect(treasuryProblems(form({ recipients: '   ' }), NOW).recipients).toBeDefined();
    expect(treasuryProblems(form({ recipients: 'aisyah.eth' }), NOW).recipients).toBeDefined();
    expect(treasuryProblems(form({ recipients: `${A}\n${A}` }), NOW).recipients).toBe(
      'The same address is listed twice.',
    );
  });

  /* Case is the only difference between these two lines, and the contract
     normalises before it compares, so the mandate would hold one entry. */
  it('treats a case-different repeat as a duplicate', () => {
    const problems = treasuryProblems(
      form({ recipients: `${A}\n${A.toUpperCase().replace('0X', '0x')}` }),
      NOW,
    );
    expect(problems.recipients).toBe('The same address is listed twice.');
  });

  it('refuses an expiry outside a sensible window', () => {
    expect(treasuryProblems(form({ expiryDays: '0' }), NOW).expiryDays).toBeDefined();
    expect(treasuryProblems(form({ expiryDays: '400' }), NOW).expiryDays).toBeDefined();
  });

  it('refuses an agent that is not an address', () => {
    expect(treasuryProblems(form({ agent: 'backend' }), NOW).agent).toBeDefined();
  });
});

describe('treasuryAmounts', () => {
  it('converts the budget and cap to base units', () => {
    const amounts = treasuryAmounts(form(), NOW);
    expect(amounts.budget).toBe(20_000_000n);
    expect(amounts.maxPerClaim).toBe(5_000_000n);
  });

  it('carries the recipients in the order they were typed', () => {
    expect(treasuryAmounts(form(), NOW).approvedRecipients).toEqual([A, B]);
  });

  it('sets an expiry in the future', () => {
    const amounts = treasuryAmounts(form(), NOW);
    expect(amounts.expiryMs).toBe(expiryMsFromDays(30, NOW));
    expect(amounts.expiryMs).toBeGreaterThan(BigInt(NOW));
  });

  it('refuses to produce amounts for a form that does not validate', () => {
    expect(() => treasuryAmounts(form({ budgetUsdc: 'lots' }), NOW)).toThrow();
  });
});
