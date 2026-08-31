import { ClaimFlow } from '@/components/claim/ClaimFlow';
import { toMandateView } from '@tali/shared';
import {
  createTestnetClient,
  readMandate,
  taliTestnetUsdcConfig,
  taliUsdcDemo,
} from '@tali/treasury-sui';

export const metadata = {
  title: 'Submit a claim · Tali Treasury',
};

export const dynamic = 'force-dynamic';

/**
 * Reads the mandate the same way the treasurer screen does. The member's budget
 * bar used to come from the mock while the banner above it said the screen was
 * live, which put an invented figure under a truthful-looking label.
 */
export default async function ClaimPage() {
  try {
    const client = createTestnetClient(process.env.SUI_GRPC_URL);
    const mandateId = process.env.TALI_MANDATE_ID ?? taliUsdcDemo.mandateId;
    const state = await readMandate(client, taliTestnetUsdcConfig, mandateId);

    return <ClaimFlow mandate={toMandateView(state)} />;
  } catch {
    return <ClaimFlow mandate={null} />;
  }
}
