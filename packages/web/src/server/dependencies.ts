import {
  createAnalyzeReceiptService,
  createClaimService,
  createListClaimsService,
  createProcessClaimService,
} from './claims/services';
import { createGoogleGeminiReceiptAnalyzer } from './receipts/gemini';
import { createSupabaseClaimRepository } from './supabase/claim-repository';
import { createServerSupabaseClient } from './supabase/client';
import { createSupabaseReceiptStore } from './supabase/receipt-store';
import { createSuiMandateReader } from './sui/mandate-reader';

export interface BackendServices {
  analyzeReceipt: ReturnType<typeof createAnalyzeReceiptService>;
  createClaim: ReturnType<typeof createClaimService>;
  listClaims: ReturnType<typeof createListClaimsService>;
  processClaim: ReturnType<typeof createProcessClaimService>;
}

let services: BackendServices | undefined;

export function getBackendServices(): BackendServices {
  if (services) return services;

  const client = createServerSupabaseClient() as Parameters<
    typeof createSupabaseClaimRepository
  >[0] &
    Parameters<typeof createSupabaseReceiptStore>[0];
  const claims = createSupabaseClaimRepository(client);
  const receipts = createSupabaseReceiptStore(client);
  const analyzer = createGoogleGeminiReceiptAnalyzer({
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
  });
  const mandates = createSuiMandateReader();

  services = {
    analyzeReceipt: createAnalyzeReceiptService({ analyzer, claims, receipts }),
    createClaim: createClaimService({ claims }),
    listClaims: createListClaimsService({ claims, receipts }),
    processClaim: createProcessClaimService({ claims, mandates }),
  };
  return services;
}
