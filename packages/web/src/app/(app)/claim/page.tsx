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

export default async function ClaimPage() {
  const apiEnabled = process.env.TALI_ALLOW_INSECURE_DEMO_IDENTITY === 'true';

  try {
    const client = createTestnetClient(process.env.SUI_GRPC_URL);
    const mandateId = process.env.TALI_MANDATE_ID ?? taliUsdcDemo.mandateId;
    const state = await readMandate(client, taliTestnetUsdcConfig, mandateId);

    return <ClaimFlow apiEnabled={apiEnabled} initialMandate={toMandateView(state)} />;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown Sui read error';
    return (
      <ClaimFlow
        apiEnabled={apiEnabled}
        initialMandate={null}
        mandateReadError={message}
      />
    );
  }
}
