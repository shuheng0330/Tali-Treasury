import type { PayrollSetupPreview } from '@/server/payroll/setup';
import { responseJson } from './client';

export async function previewPayrollSetup(input: {
  employee: string;
  expiryMs: number;
}): Promise<PayrollSetupPreview> {
  return responseJson<PayrollSetupPreview>(
    await fetch('/api/payroll/setup/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}
