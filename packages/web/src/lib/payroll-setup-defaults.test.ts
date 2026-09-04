import { describe, expect, it } from 'vitest';
import { initialPayrollEmployee } from './payroll-setup-defaults';

describe('initialPayrollEmployee', () => {
  it('prefers the configured employee over the connected employer wallet', () => {
    const employee = `0x${'40'.repeat(32)}`;
    expect(initialPayrollEmployee(employee, `0x${'c4'.repeat(32)}`)).toBe(employee);
  });

  it('uses the connected wallet only when no employee is configured', () => {
    const connected = `0x${'c4'.repeat(32)}`;
    expect(initialPayrollEmployee('', connected)).toBe(connected);
  });
});
