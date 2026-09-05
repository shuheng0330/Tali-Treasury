import { BudgetMeter } from '@/components/BudgetMeter';
import { Money } from '@/components/Money';
import { StatusChip, type ChipStatus } from '@/components/StatusChip';
import { toBaseUnits } from '@tali/shared';

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

const TYPE_SCALE = [
  { token: 'hero', sample: 'Set the rules once', className: 'text-hero' },
  { token: 'display', sample: 'The money enforces them', className: 'text-display' },
  { token: 'title', sample: 'Watch it refuse fifteen', className: 'text-title' },
  { token: 'heading', sample: 'Checking the rules', className: 'text-heading' },
  { token: 'subhead', sample: 'Held for review', className: 'text-subhead' },
  { token: 'lead', sample: 'One student should not front the money', className: 'text-lead' },
  { token: 'body', sample: 'The mandate decides, not the app.', className: 'text-body' },
  { token: 'caption', sample: 'submitted by Kian Xiang', className: 'text-caption' },
  { token: 'control', sample: 'Run preview', className: 'text-control uppercase' },
  { token: 'label', sample: 'Needs review', className: 'text-label uppercase' },
];

const SURFACES = [
  { token: 'canvas', className: 'bg-canvas' },
  { token: 'surface', className: 'bg-surface' },
  { token: 'raised', className: 'bg-raised' },
  { token: 'sunken', className: 'bg-sunken' },
  { token: 'ink', className: 'bg-ink' },
  { token: 'accent', className: 'bg-accent' },
];

const RADII = [
  { token: 'control', className: 'rounded-control' },
  { token: 'card', className: 'rounded-card' },
  { token: 'modal', className: 'rounded-modal' },
  { token: 'panel', className: 'rounded-panel' },
  { token: 'badge / pill', className: 'rounded-badge' },
];

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-panel border border-rule bg-surface">
      <h2 className="eyebrow border-b border-rule px-6 py-4">{title}</h2>
      <div className="p-6">{children}</div>
    </section>
  );
}

export default function Page() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-3">
        <p className="eyebrow">Reference</p>
        <h1 className="text-title">Design system</h1>
        <p className="max-w-2xl text-body text-ink-2">
          Bricolage Grotesque for anything set large or tracked, Albert Sans for reading, IBM
          Plex Mono for anything you might copy. One accent, used as a fill rather than as text.
        </p>
      </div>

      <Panel title="Type scale">
        <div className="flex flex-col gap-5">
          {TYPE_SCALE.map((step) => (
            <div key={step.token} className="flex flex-col gap-1 border-b border-rule pb-4 last:border-0 last:pb-0">
              <span className="eyebrow">{step.token}</span>
              <span className={`${step.className} truncate font-display`}>{step.sample}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn--primary">
            Primary
          </button>
          <button type="button" className="btn btn--accent">
            Accent
          </button>
          <button type="button" className="btn btn--ghost">
            Ghost
          </button>
          <button type="button" className="btn btn--danger">
            Danger
          </button>
          <button type="button" className="btn btn--primary" disabled>
            Disabled
          </button>
        </div>
      </Panel>

      <Panel title="Surfaces and accent">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
          {SURFACES.map((surface) => (
            <div key={surface.token} className="flex flex-col gap-2">
              <span
                className={`h-16 rounded-card border border-rule ${surface.className}`}
                aria-hidden
              />
              <span className="eyebrow">{surface.token}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Radii">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {RADII.map((radius) => (
            <div key={radius.token} className="flex flex-col gap-2">
              <span
                className={`h-16 border border-rule-strong bg-raised ${radius.className}`}
                aria-hidden
              />
              <span className="eyebrow">{radius.token}</span>
            </div>
          ))}
        </div>
      </Panel>

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
    </div>
  );
}
