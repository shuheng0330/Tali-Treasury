import { BudgetMeter } from '@/components/BudgetMeter';
import { Money } from '@/components/Money';
import { StatusChip, type ChipStatus } from '@/components/StatusChip';
import { EXPLORER, toBaseUnits } from '@tali/shared';
import { MANDATE_ID } from '@/lib/mock/data';

const CLAIM_STATUSES: ChipStatus[] = [
  'draft',
  'analysing',
  'submitted',
  'needs_correction',
  'needs_review',
  'approved',
  'paid',
  'rejected',
  'payment_failed',
];

const MANDATE_STATUSES: ChipStatus[] = ['active', 'expired', 'revoked'];

function truncate(id: string) {
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-rule bg-surface">
      <h2 className="border-b border-rule px-5 py-3 text-label uppercase text-ink-3">{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function Page() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
          <span className="text-subhead font-semibold">Tali Treasury</span>
          <a
            href={EXPLORER.object(MANDATE_ID).suiscan}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-caption text-ink-3 underline-offset-4 hover:text-ink-2 hover:underline"
          >
            {truncate(MANDATE_ID)}
          </a>
          <StatusChip status="active" />
          <span className="ml-auto text-caption text-ink-3">Sui testnet</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8">
        <Panel title="Orientation Week — event budget">
          <BudgetMeter
            settled={toBaseUnits('412.00')}
            committed={toBaseUnits('180.00')}
            available={toBaseUnits('1408.00')}
            budget={toBaseUnits('2000.00')}
          />
        </Panel>

        <Panel title="Claim status">
          <div className="flex flex-wrap gap-2">
            {CLAIM_STATUSES.map((status) => (
              <StatusChip key={status} status={status} />
            ))}
          </div>
        </Panel>

        <Panel title="Mandate status">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {MANDATE_STATUSES.map((status) => (
                <StatusChip key={status} status={status} />
              ))}
            </div>
            <p className="max-w-prose text-caption text-ink-2">
              Rejected is a person declining a claim. Revoked is the treasurer pulling a permission
              the agent already held. Revoked is the only status drawn with a dashed border, and its
              amount is struck through.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-2">
                <StatusChip status="rejected" />
                <Money amount={toBaseUnits('340.00')} size="row" />
              </span>
              <span className="flex items-center gap-2 text-dead">
                <StatusChip status="revoked" />
                <Money amount={toBaseUnits('340.00')} size="row" struck />
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="Amounts">
          <div className="flex flex-col gap-3">
            <Money amount={toBaseUnits('84.00')} size="inline" />
            <Money amount={toBaseUnits('412.50')} size="row" />
            <Money amount={toBaseUnits('1408.00')} size="lead" />
            <Money amount={toBaseUnits('2000.00')} size="hero" />
          </div>
        </Panel>
      </main>
    </div>
  );
}
