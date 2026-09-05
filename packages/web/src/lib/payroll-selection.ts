import type { PayrollConfigurationView } from '@tali/shared';

export function resolvePayrollSelection(
  configurations: PayrollConfigurationView[],
  requested: string | null,
): { selected: PayrollConfigurationView | null; autoSelect: string | null } {
  const selected = configurations.find((item) => item.mandateId === requested) ?? null;
  return {
    selected,
    autoSelect: !selected && configurations.length === 1 ? configurations[0]!.mandateId : null,
  };
}
