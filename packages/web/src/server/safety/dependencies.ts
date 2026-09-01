import { taliUsdcDemo } from '@tali/treasury-sui';

import { createSuiMandateReader } from '../sui/mandate-reader';
import { createSuiPaymentExecutor } from '../sui/payment-executor';
import { createSafetyService, type SafetyService } from './service';

let service: SafetyService | undefined;

export function getSafetyService(): SafetyService {
  if (!service) {
    service = createSafetyService({
      executor: createSuiPaymentExecutor(),
      mandates: createSuiMandateReader(),
      mandateId: process.env.TALI_MANDATE_ID ?? taliUsdcDemo.mandateId,
    });
  }
  return service;
}

/** Whether an attack on this deployment reaches Sui rather than a prediction. */
export function safetyCanBroadcast(): boolean {
  try {
    getSafetyService().assertReady();
    return true;
  } catch {
    return false;
  }
}
