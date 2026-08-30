'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { MandateView } from '@tali/shared';
import { CLAIM_CHIP } from '@tali/shared';
import { Money } from '@/components/Money';
import { StatusChip } from '@/components/StatusChip';
import { event } from '@/lib/mock/data';
import { reviewQueue, settledClaims } from '@/lib/mock/api';
import { ClaimRow } from './ClaimRow';
import { MandateHeader } from './MandateHeader';
import { RevokeDialog } from './RevokeDialog';

type Tab = 'review' | 'paid' | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'review', label: 'Needs review' },
  { id: 'paid', label: 'Auto-paid' },
  { id: 'all', label: 'All' },
];

interface Props {
  initialMandate: MandateView | null;
  readError?: string;
}

const NO_COMMITTED_CLAIMS = '0';

export function TreasuryDashboard({ initialMandate: mandate, readError }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [queue, setQueue] = useState(() => reviewQueue());
  const [tab, setTab] = useState<Tab>('review');
  const [confirming, setConfirming] = useState(false);

  const paid = useMemo(() => settledClaims(), []);
  const counts = { review: queue.length, paid: paid.length, all: queue.length + paid.length };

  function resolve(id: string) {
    setQueue((items) => items.filter((item) => item.claim.id !== id));
  }

  if (mandate === null) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-5 py-8">
        <h1 className="text-heading">Treasury unavailable</h1>
        <p className="text-body text-ink-2">
          Tali could not read the USDC mandate from Sui Testnet. No mock chain balance was substituted.
        </p>
        <p className="break-all rounded-card border border-rule bg-surface p-4 font-mono text-caption text-ink-2">
          {readError ?? 'Unknown Sui read error'}
        </p>
        <button type="button" onClick={() => router.refresh()} className="w-fit rounded-control bg-accent px-4 py-2 text-body font-medium text-surface">
          Retry live read
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-8">
      <MandateHeader
        eventName={event.name}
        organisation={event.organisation}
        mandate={mandate}
        committed={NO_COMMITTED_CLAIMS}
        onRevoke={() => setConfirming(true)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-ok-line bg-ok-soft px-4 py-3">
        <div>
          <p className="text-body font-medium text-ok">Live from Sui Testnet</p>
          <p className="text-caption text-ink-2">
            Read at {new Date(mandate.fetchedAtMs).toLocaleTimeString('en-GB')} · Circle Testnet USDC
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => startRefresh(() => router.refresh())}
          className="rounded-control border border-rule bg-surface px-4 py-2 text-body transition-colors hover:bg-raised disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh chain state'}
        </button>
      </div>

      <section className="flex flex-col rounded-card border border-rule bg-surface">
        <div className="border-b border-wait-line bg-wait-soft px-4 py-3 text-body text-ink-2">
          <span className="font-medium text-wait">Demo claim data:</span> the queue below is simulated until the backend is connected.
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-rule px-3 py-2">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={`rounded-control px-3 py-1.5 text-caption transition-colors duration-150 ${
                tab === entry.id ? 'bg-raised font-medium text-ink' : 'text-ink-3 hover:bg-raised'
              }`}
            >
              {entry.label}
              <span className="tnum ml-2 text-ink-3">{counts[entry.id]}</span>
            </button>
          ))}
        </div>

        {tab === 'review' ? (
          queue.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span className="text-heading text-ok" aria-hidden>
                ✓
              </span>
              <p className="text-subhead">Nothing needs you</p>
              <p className="max-w-sm text-caption text-ink-3">
                The agent has paid {paid.length} claims from this mandate and escalated
                nothing in the last six hours.
              </p>
              <Link
                href="/safety"
                className="mt-2 rounded-control border border-rule px-4 py-2 text-caption transition-colors duration-150 hover:bg-raised"
              >
                Run a safety test
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-rule">
              {queue.map((item) => (
                <ClaimRow key={item.claim.id} item={item} onApprove={resolve} onReject={resolve} />
              ))}
            </ul>
          )
        ) : null}

        {tab !== 'review' ? (
          <ul className="flex flex-col divide-y divide-rule">
            {(tab === 'paid' ? paid : [...queue.map((item) => item.claim), ...paid]).map((claim) => (
              <li key={claim.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-body">{claim.merchant}</span>
                  <span className="flex items-center gap-2">
                    <StatusChip status={CLAIM_CHIP[claim.state]} />
                    <span className="text-caption text-ink-3">{claim.submitterName}</span>
                  </span>
                </div>
                <Money amount={claim.amount} size="row" />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {confirming ? (
        <RevokeDialog
          eventName={event.name}
          remaining={mandate.remainingBudget}
          pendingCount={queue.length}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
          }}
        />
      ) : null}
    </div>
  );
}
