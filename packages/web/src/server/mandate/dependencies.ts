import { taliUsdcDemo } from '@tali/treasury-sui';

import { createSuiRevokeExecutor } from '../sui/revoke-executor';
import type { RevokeMandatePort } from './ports';

let port: RevokeMandatePort | undefined;

export function getRevokePort(): RevokeMandatePort {
  port ??= createSuiRevokeExecutor();
  return port;
}

export function mandateIdForRevocation(): string {
  return process.env.TALI_MANDATE_ID ?? taliUsdcDemo.mandateId;
}
