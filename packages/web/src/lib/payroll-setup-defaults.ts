/**
 * Chooses the employee shown when payroll setup opens.
 *
 * The configured demo employee must win over the connected wallet: that wallet
 * is the employer funding the mandate, not the person receiving wages. Falling
 * back to the connected address keeps an unconfigured local checkout usable.
 */
export function initialPayrollEmployee(
  configuredEmployee: string,
  connectedWallet: string | null | undefined,
): string {
  return configuredEmployee.trim() || connectedWallet?.trim() || '';
}
