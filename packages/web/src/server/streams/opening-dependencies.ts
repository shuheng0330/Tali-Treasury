import { createServerSupabaseClient } from '../supabase/client';
import { createSupabaseSalaryStreamRepository } from '../supabase/salary-stream-repository';
import type { PayrollConfigurationService } from '../payroll/configurations';
import { createSuiSalaryStreamOpener } from '../sui/salary-stream-opener';
import { createSalaryStreamOpeningService } from './opening';

export function getSalaryStreamOpeningService(configurations: PayrollConfigurationService) {
  return createSalaryStreamOpeningService({
    configurations,
    streams: createSupabaseSalaryStreamRepository(createServerSupabaseClient() as never),
    chain: createSuiSalaryStreamOpener(),
  });
}
