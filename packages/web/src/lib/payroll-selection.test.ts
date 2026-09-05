import { describe, expect, it } from 'vitest';
import type { PayrollConfigurationView } from '@tali/shared';

import { resolvePayrollSelection } from './payroll-selection';

const configuration = { mandateId: '0xone' } as PayrollConfigurationView;

describe('registered payroll URL selection', () => {
  it('auto-selects exactly one accessible payroll', () => {
    expect(resolvePayrollSelection([configuration], null)).toEqual({ selected: null, autoSelect: '0xone' });
  });

  it('requires an explicit valid choice for multiple payrolls', () => {
    const second = { mandateId: '0xtwo' } as PayrollConfigurationView;
    expect(resolvePayrollSelection([configuration, second], null)).toEqual({ selected: null, autoSelect: null });
    expect(resolvePayrollSelection([configuration, second], '0xinvalid')).toEqual({ selected: null, autoSelect: null });
    expect(resolvePayrollSelection([configuration, second], '0xtwo').selected).toBe(second);
  });

  it('leaves the empty state unselected', () => {
    expect(resolvePayrollSelection([], null)).toEqual({ selected: null, autoSelect: null });
  });
});
