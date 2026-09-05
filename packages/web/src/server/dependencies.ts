import {
  createAnalyzeReceiptService,
  createClaimService,
  createListClaimsService,
  createProcessClaimService,
  createReconcileClaimService,
  createReviewClaimService,
} from './claims/services';
import { createResubmitClaimService } from './claims/resubmit';
import { createPayApprovedClaimService } from './claims/pay';
import {
  createCompleteWalletSessionService,
  createIssueWalletChallengeService,
} from './auth/service';
import { requireAppOrigin } from './env';
import { createGoogleGeminiReceiptAnalyzer } from './receipts/gemini';
import { createSupabaseClaimRepository } from './supabase/claim-repository';
import { createSupabaseAnalysisDraftRepository } from './supabase/analysis-draft-repository';
import { createServerSupabaseClient } from './supabase/client';
import { createSupabaseReceiptStore } from './supabase/receipt-store';
import { createSupabaseWalletAuthRepository } from './supabase/wallet-auth-repository';
import { createSuiMandateReader } from './sui/mandate-reader';
import { createSuiPaymentExecutor } from './sui/payment-executor';
import {
  createAddEventMemberService,
  createListEventMembersService,
} from './events/members';
import { createSupabaseEventMemberRepository } from './supabase/event-member-repository';
import { createSupabaseRateCache } from './fx/cache';
import { createOpenExchangeRateReader } from './fx/rates';
import { createClaimQuoter } from './fx/quotes';
import { createRegisterPayrollService } from './payroll/registration';
import { createSuiPayrollRegistrationVerifier } from './sui/payroll-registration-verifier';
import { createSupabasePayrollConfigurationRepository } from './supabase/payroll-configuration-repository';
import { createPayrollConfigurationService } from './payroll/configurations';
import { requireEmployerWallet } from './auth/authorization';

export interface BackendServices {
  analyzeReceipt: ReturnType<typeof createAnalyzeReceiptService>;
  createClaim: ReturnType<typeof createClaimService>;
  listClaims: ReturnType<typeof createListClaimsService>;
  processClaim: ReturnType<typeof createProcessClaimService>;
  reconcileClaim: ReturnType<typeof createReconcileClaimService>;
  reviewClaim: ReturnType<typeof createReviewClaimService>;
  resubmitClaim: ReturnType<typeof createResubmitClaimService>;
  payApprovedClaim: ReturnType<typeof createPayApprovedClaimService>;
  auth: ReturnType<typeof createSupabaseWalletAuthRepository>;
  issueWalletChallenge: ReturnType<typeof createIssueWalletChallengeService>;
  completeWalletSession: ReturnType<typeof createCompleteWalletSessionService>;
  addEventMember: ReturnType<typeof createAddEventMemberService>;
  listEventMembers: ReturnType<typeof createListEventMembersService>;
  registerPayroll: ReturnType<typeof createRegisterPayrollService>;
  payrollConfigurations: ReturnType<typeof createPayrollConfigurationService>;
  appOrigin: string;
}

let services: BackendServices | undefined;

export function getBackendServices(): BackendServices {
  if (services) return services;

  const client = createServerSupabaseClient() as Parameters<
    typeof createSupabaseClaimRepository
  >[0] &
    Parameters<typeof createSupabaseReceiptStore>[0] &
    Parameters<typeof createSupabaseWalletAuthRepository>[0] &
    Parameters<typeof createSupabaseAnalysisDraftRepository>[0] &
    Parameters<typeof createSupabaseEventMemberRepository>[0] &
    Parameters<typeof createSupabasePayrollConfigurationRepository>[0] &
    Parameters<typeof createSupabaseRateCache>[0];
  const claims = createSupabaseClaimRepository(client);
  const receipts = createSupabaseReceiptStore(client);
  const drafts = createSupabaseAnalysisDraftRepository(client);
  const analyzer = createGoogleGeminiReceiptAnalyzer({
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
  });
  const mandates = createSuiMandateReader();
  const payments = createSuiPaymentExecutor();
  const auth = createSupabaseWalletAuthRepository(client);
  const members = createSupabaseEventMemberRepository(client);
  const payrollConfigurations = createSupabasePayrollConfigurationRepository(client);
  const appOrigin = requireAppOrigin();
  const quotes = createClaimQuoter({ rates: createOpenExchangeRateReader({
    appId: () => process.env.OPEN_EXCHANGE_RATES_APP_ID,
    cache: createSupabaseRateCache(client),
  }) });

  services = {
    analyzeReceipt: createAnalyzeReceiptService({ analyzer, claims, receipts, drafts }),
    createClaim: createClaimService({ drafts }),
    listClaims: createListClaimsService({ claims, receipts }),
    processClaim: createProcessClaimService({ claims, mandates, payments, quotes }),
    reconcileClaim: createReconcileClaimService({ claims, payments }),
    reviewClaim: createReviewClaimService({ claims, mandates, payments }),
    resubmitClaim: createResubmitClaimService({ claims }),
    payApprovedClaim: createPayApprovedClaimService({ claims, mandates, payments }),
    auth,
    issueWalletChallenge: createIssueWalletChallengeService({ auth, appOrigin }),
    completeWalletSession: createCompleteWalletSessionService({ auth }),
    addEventMember: createAddEventMemberService({ members }),
    listEventMembers: createListEventMembersService({ members }),
    registerPayroll: createRegisterPayrollService({
      chain: createSuiPayrollRegistrationVerifier(),
      configurations: payrollConfigurations,
    }),
    payrollConfigurations: createPayrollConfigurationService({
      configurations: payrollConfigurations,
      employer: requireEmployerWallet(),
    }),
    appOrigin,
  };
  return services;
}
