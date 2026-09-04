import { describe, expect, it } from 'vitest';
import {
  capProblem,
  coverageProblem,
  expiryMsFromDays,
  mandateAmounts,
  NET_MIN_BPS,
  setupProblems,
  type SetupFormValue,
} from './payroll-setup';

const EMPLOYEE = '0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e';
const AGENT = '0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471';
const EPF = '0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9';
const SOCSO = '0x16b9fdc16764d6fa514fb6da55df5ca840d30e5bb057eba6a5ab67cf743c7f6f';
const EIS = '0x7be8aa82872facbd01372cdeb20375a82f74011dca1512e41737664a759dc523';

const NOW = 1_757_000_000_000;

function form(overrides: Partial<SetupFormValue> = {}): SetupFormValue {
  return {
    employee: EMPLOYEE,
    capRecipient: AGENT,
    fundingMyr: '50.00',
    maxPerRunMyr: '40.00',
    expiryDays: '30',
    recipients: { epf: EPF, socso: SOCSO, eis: EIS },
    ...overrides,
  };
}

describe('setupProblems', () => {
  it('accepts the agreed demo configuration', () => {
    expect(setupProblems(form(), NOW)).toEqual({});
  });

  it('rejects an address that is not a Sui address', () => {
    expect(setupProblems(form({ employee: 'aisyah.eth' }), NOW).employee).toBeDefined();
    expect(setupProblems(form({ capRecipient: '' }), NOW).capRecipient).toBeDefined();
  });

  it('rejects two bodies sharing one address', () => {
    const problems = setupProblems(
      form({ recipients: { epf: EPF, socso: EPF, eis: EIS } }),
      NOW,
    );
    expect(problems.socso).toBe('Each body needs its own address.');
    expect(problems.epf).toBeUndefined();
  });

  it('rejects a budget below the narrowest supported wage band', () => {
    expect(setupProblems(form({ fundingMyr: '5.00' }), NOW).fundingMyr).toBeDefined();
  });

  it('rejects a per-run cap larger than the whole budget', () => {
    const problems = setupProblems(form({ fundingMyr: '50', maxPerRunMyr: '60' }), NOW);
    expect(problems.maxPerRunMyr).toBe(
      'One run cannot be allowed to spend more than the whole budget.',
    );
  });

  it('rejects more than six decimals, which USDC cannot carry', () => {
    expect(setupProblems(form({ fundingMyr: '50.1234567' }), NOW).fundingMyr).toBeDefined();
  });

  it('rejects an expiry that is not a whole number of days ahead', () => {
    expect(setupProblems(form({ expiryDays: '0' }), NOW).expiryDays).toBeDefined();
    expect(setupProblems(form({ expiryDays: '400' }), NOW).expiryDays).toBeDefined();
    expect(setupProblems(form({ expiryDays: '1.5' }), NOW).expiryDays).toBeDefined();
  });
});

describe('mandateAmounts', () => {
  /* The rate and the resulting budget are the worked example in
     docs/PAYROLL_LAUNCH_PLAN.md, so this fails if the conversion drifts away
     from the figure the team agreed to fund. */
  const RATE = '4.0416';

  it('converts the RM50 ceiling to the documented USDC budget', () => {
    expect(mandateAmounts(form(), RATE, NOW).budget).toBe(12_371_338n);
  });

  it('converts the per-run cap through the same rate', () => {
    expect(mandateAmounts(form(), RATE, NOW).maxPerRun).toBe(9_897_070n);
  });

  it('pairs each floor with its own recipient, in contract order', () => {
    const { floors } = mandateAmounts(form(), RATE, NOW);
    expect(floors.map((floor) => floor.recipient)).toEqual([EPF, SOCSO, EIS]);
    expect(floors.map((floor) => floor.minBps)).toEqual([2300n, 225n, 40n]);
  });

  it('leaves EPF uncapped and caps SOCSO and EIS at the same converted wage', () => {
    const [epf, socso, eis] = mandateAmounts(form(), RATE, NOW).floors;
    expect(epf!.wageCap).toBe(0n);
    expect(socso!.wageCap).toBeGreaterThan(0n);
    expect(socso!.wageCap).toBe(eis!.wageCap);
  });

  it('carries the net floor and an expiry in the future', () => {
    const amounts = mandateAmounts(form(), RATE, NOW);
    expect(amounts.netMinBps).toBe(NET_MIN_BPS);
    expect(amounts.expiryMs).toBe(expiryMsFromDays(30, NOW));
    expect(amounts.expiryMs).toBeGreaterThan(BigInt(NOW));
  });

  it('refuses to produce amounts for a form that does not validate', () => {
    expect(() => mandateAmounts(form({ fundingMyr: 'lots' }), RATE, NOW)).toThrow();
  });
});

describe('coverage checks', () => {
  it('flags a budget that cannot pay one run', () => {
    expect(coverageProblem(9_000_000n, 9_052_109n)).toContain('smaller than one month');
    expect(coverageProblem(12_371_338n, 9_052_109n)).toBeNull();
  });

  it('flags a per-run cap below one run', () => {
    expect(capProblem(9_000_000n, 9_052_109n)).toContain('below this wage');
    expect(capProblem(9_897_070n, 9_052_109n)).toBeNull();
  });

  it('says nothing while there is no split to compare against', () => {
    expect(coverageProblem(0n, 0n)).toBeNull();
    expect(capProblem(0n, 0n)).toBeNull();
  });
});
