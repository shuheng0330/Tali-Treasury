import type { Address, PayrollConfigurationView, PayrollViewerRole } from '@tali/shared';
import { STATUTORY_BODIES } from '@tali/shared';

import { ServerError } from '../errors';
import { suiAddressSchema } from '../claims/validation';
import type { PayrollConfigurationSnapshot, PayrollRegistrationRepository } from './registration';

function view(snapshot: PayrollConfigurationSnapshot, role: PayrollViewerRole): PayrollConfigurationView {
  const employee = snapshot.approvedEmployees[0];
  if (!employee || snapshot.statutoryTerms.length !== STATUTORY_BODIES.length) {
    throw new ServerError('database_failed', 500, 'The database operation failed');
  }
  return {
    mandateId: snapshot.mandateId as PayrollConfigurationView['mandateId'],
    packageId: snapshot.packageId as PayrollConfigurationView['packageId'],
    coinType: snapshot.coinType,
    employee: employee as Address,
    statutoryRules: STATUTORY_BODIES.map((body, index) => ({
      body,
      recipient: snapshot.statutoryTerms[index]!.recipient,
      minBps: snapshot.statutoryTerms[index]!.minBps,
      wageCap: snapshot.statutoryTerms[index]!.wageCap,
    })),
    initialBudget: snapshot.initialBudget,
    maximumPerRun: snapshot.maxPerRun,
    netMinimumBps: snapshot.netMinBps,
    expiryMs: Number(snapshot.expiryMs),
    registeredAtMs: snapshot.registeredAtMs ?? 0,
    role,
  };
}

export function createPayrollConfigurationService(deps: {
  configurations: PayrollRegistrationRepository;
  employer: string;
}) {
  async function actor(value: string): Promise<Address> {
    const parsed = suiAddressSchema.safeParse(value);
    if (!parsed.success) throw new ServerError('authentication_required', 401, 'Sign in with your wallet');
    return parsed.data;
  }

  return {
    async list(actorValue: string): Promise<PayrollConfigurationView[]> {
      const address = await actor(actorValue);
      const employer = address === deps.employer;
      const reader = employer ? deps.configurations.listByEmployer : deps.configurations.listByEmployee;
      if (!reader) throw new ServerError('database_failed', 500, 'The database operation failed');
      const rows = employer
        ? await reader.call(deps.configurations, address)
        : await reader.call(deps.configurations, address);
      return rows.map((row) => view(row, employer ? 'employer' : 'employee'));
    },
    async requireAuthorized(actorValue: string, mandateId: string, role?: PayrollViewerRole) {
      const address = await actor(actorValue);
      const parsedMandate = suiAddressSchema.safeParse(mandateId);
      if (!parsedMandate.success) throw new ServerError('invalid_request', 400, 'Invalid payroll mandate ID');
      if (!deps.configurations.findByMandateId) throw new ServerError('database_failed', 500, 'The database operation failed');
      const row = await deps.configurations.findByMandateId(parsedMandate.data);
      if (!row) throw new ServerError('payroll_not_found', 404, 'Registered payroll not found');
      const actualRole: PayrollViewerRole | null = address === row.employerWallet
        ? 'employer'
        : row.approvedEmployees.includes(address) ? 'employee' : null;
      if (!actualRole || (role && role !== actualRole)) {
        throw new ServerError('payroll_forbidden', 403, 'This wallet cannot access the selected payroll');
      }
      return { snapshot: row, view: view(row, actualRole), role: actualRole };
    },
  };
}

export type PayrollConfigurationService = ReturnType<typeof createPayrollConfigurationService>;
