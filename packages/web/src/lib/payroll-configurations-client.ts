import type { ListPayrollConfigurationsResponse } from '@tali/shared';

export async function loadPayrollConfigurations(
  fetcher: typeof fetch = fetch,
): Promise<
  | { status: 'ready'; configurations: ListPayrollConfigurationsResponse['configurations'] }
  | { status: 'unauthorized' }
> {
  const response = await fetcher('/api/payroll/configurations', { cache: 'no-store' });
  if (response.status === 401) return { status: 'unauthorized' };
  if (!response.ok) throw new Error('unavailable');
  const body = await response.json() as ListPayrollConfigurationsResponse;
  return { status: 'ready', configurations: body.configurations };
}
