import { TreasuryDashboard } from '@/components/treasury/TreasuryDashboard';
import { toMandateView } from '@tali/shared';
import {
  createTestnetClient,
  readMandate,
  taliTestnetUsdcConfig,
  taliUsdcDemo,
} from '@tali/treasury-sui';

export const metadata = {
  title: 'Treasury · Tali Treasury',
};

export const dynamic = 'force-dynamic';

export default async function TreasuryPage() {
  const apiEnabled = true;

  try {
    const client = createTestnetClient(process.env.SUI_GRPC_URL);
    const mandateId = process.env.TALI_MANDATE_ID ?? taliUsdcDemo.mandateId;
    const state = await readMandate(client, taliTestnetUsdcConfig, mandateId);

    return (
      <TreasuryDashboard apiEnabled={apiEnabled} initialMandate={toMandateView(state)} />
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown Sui read error';
    return (
      <TreasuryDashboard apiEnabled={apiEnabled} initialMandate={null} readError={message} />
    );
  }
}
