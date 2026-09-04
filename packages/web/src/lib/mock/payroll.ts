import type { PayrollBreakdown, StatutoryBody } from '@tali/shared';

/**
 * Fixed sample breakdowns so the payroll screens can be built and reviewed
 * before the statutory calculator exists.
 *
 * Deliberately a lookup table rather than a calculator. A second implementation
 * of the EPF schedule would drift from the real one and the wrong one would be
 * on screen the day it mattered. When `POST /api/payroll/preview` lands, these
 * are replaced wholesale.
 *
 * Figures follow the Third Schedule method: the rate applied to the wage band
 * ceiling, rounded up to the next ringgit. Employer EPF is 13% at or below
 * RM5,000 and 12% above it, which is why Priya clears the on-chain floor by a
 * smaller margin than the other two.
 */

const RECIPIENTS: Record<StatutoryBody, string> = {
  epf: '0xepf00000000000000000000000000000000000000000000000000000000000',
  socso: '0xsocso000000000000000000000000000000000000000000000000000000000',
  eis: '0xeis00000000000000000000000000000000000000000000000000000000000',
};

export interface SampleEmployee {
  name: string;
  role: string;
  address: string;
  breakdown: PayrollBreakdown;
}

function ringgit(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString();
}

function breakdown(input: {
  employee: string;
  gross: string;
  net: string;
  employerCost: string;
  epf: [string, string];
  socso: [string, string];
  eis: [string, string];
}): PayrollBreakdown {
  const body = (
    name: StatutoryBody,
    [employee, employer]: [string, string],
  ) => ({
    body: name,
    employee: ringgit(employee),
    employer: ringgit(employer),
    total: (BigInt(ringgit(employee)) + BigInt(ringgit(employer))).toString(),
  });

  return {
    employee: input.employee,
    gross: ringgit(input.gross),
    net: ringgit(input.net),
    employerCost: ringgit(input.employerCost),
    bodies: [body('epf', input.epf), body('socso', input.socso), body('eis', input.eis)],
    recipients: RECIPIENTS,
    currency: 'MYR',
  };
}

export const sampleStaff: SampleEmployee[] = [
  {
    name: 'Aisyah Rahman',
    role: 'Operations executive',
    address: '0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e',
    breakdown: breakdown({
      employee: '0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e',
      gross: '30.00',
      net: '24.79',
      employerCost: '36.585',
      epf: ['5.00', '6.00'],
      socso: ['0.15', '0.525'],
      eis: ['0.06', '0.06'],
    }),
  },
  {
    name: 'Daniel Tan',
    role: 'Software engineer',
    address: '0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471',
    breakdown: breakdown({
      employee: '0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471',
      gross: '4500.00',
      net: '3973.50',
      employerCost: '5172.75',
      epf: ['495.00', '585.00'],
      socso: ['22.50', '78.75'],
      eis: ['9.00', '9.00'],
    }),
  },
  {
    name: 'Priya Nair',
    role: 'Finance lead',
    address: '0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9',
    breakdown: breakdown({
      employee: '0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9',
      gross: '6800.00',
      net: '6010.00',
      employerCost: '7733.00',
      epf: ['748.00', '816.00'],
      // Both capped at RM6,000 of wages.
      socso: ['30.00', '105.00'],
      eis: ['12.00', '12.00'],
    }),
  },
].slice(0, 1);
