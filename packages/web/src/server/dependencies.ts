import {
  createAnalyzeReceiptService,
  createClaimService,
  createListClaimsService,
  createProcessClaimService,
  createReviewClaimService,
} from './claims/services';
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

export interface BackendServices {
  analyzeReceipt: ReturnType<typeof createAnalyzeReceiptService>;
  createClaim: ReturnType<typeof createClaimService>;
  listClaims: ReturnType<typeof createListClaimsService>;
  processClaim: ReturnType<typeof createProcessClaimService>;
  reviewClaim: ReturnType<typeof createReviewClaimService>;
  auth: ReturnType<typeof createSupabaseWalletAuthRepository>;
  issueWalletChallenge: ReturnType<typeof createIssueWalletChallengeService>;
  completeWalletSession: ReturnType<typeof createCompleteWalletSessionService>;
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
    Parameters<typeof createSupabaseAnalysisDraftRepository>[0];
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
  const appOrigin = requireAppOrigin();

  services = {
    analyzeReceipt: createAnalyzeReceiptService({ analyzer, claims, receipts, drafts }),
    createClaim: createClaimService({ drafts }),
    listClaims: createListClaimsService({ claims, receipts }),
    processClaim: createProcessClaimService({ claims, mandates, payments }),
    reviewClaim: createReviewClaimService({ claims, mandates, payments }),
    auth,
    issueWalletChallenge: createIssueWalletChallengeService({ auth, appOrigin }),
    completeWalletSession: createCompleteWalletSessionService({ auth }),
    appOrigin,
  };
  return services;
}
