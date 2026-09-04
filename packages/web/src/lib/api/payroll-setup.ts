import type { PayrollSetupPreview } from '@/server/payroll/setup';
import type { RegisterPayrollRequest, RegisterPayrollResponse } from '@tali/shared';
import type { VerifiedPayrollSetup } from '@/server/payroll/setup-verification';
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

export async function verifyPayrollSetup(digest: string): Promise<VerifiedPayrollSetup> {
  return responseJson<VerifiedPayrollSetup>(
    await fetch('/api/payroll/setup/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ digest }),
    }),
  );
}

export async function registerPayrollSetup(digest: string): Promise<RegisterPayrollResponse> {
  const request: RegisterPayrollRequest = { digest };
  return responseJson<RegisterPayrollResponse>(
    await fetch('/api/payroll/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    }),
  );
}
