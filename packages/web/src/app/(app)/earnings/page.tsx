import { DataNotice } from '@/components/DataNotice';
import { LiveBalance } from '@/components/earnings/LiveBalance';
import { payrollStage, streamFallbackReason } from '@/lib/chain-status';
import {
  DEMO_STREAM_ID,
  getStreamService,
  streamsAreLive,
} from '@/server/streams/dependencies';

export const metadata = {
  title: 'Your earnings · Tali Treasury',
};

export const dynamic = 'force-dynamic';

export default async function EarningsPage() {
  const stream = await getStreamService().read(DEMO_STREAM_ID);
  const live = streamsAreLive();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <DataNotice
        source={live ? 'live' : 'mock'}
        reason={live ? null : streamFallbackReason(payrollStage())}
        live="Salary accrual and withdrawal"
        simulated="Accrual is computed with the same arithmetic the contract uses, so the figure will not move when this is wired to Sui."
      />

      <header className="flex flex-col gap-2">
        <h1 className="text-display">Your earnings</h1>
        <p className="text-body text-ink-2">
          Your pay builds up every second you are employed. You can take what you
          have already earned whenever you need it.
        </p>
      </header>

      <LiveBalance initial={stream} />
    </div>
  );
}
