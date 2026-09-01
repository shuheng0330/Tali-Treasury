import type { PayrollRunView } from '@tali/shared';
import { STATUTORY_BODIES, STATUTORY_BODY_LABEL, toDisplay } from '@tali/shared';

import { Money } from '@/components/Money';
import { StatusChip } from '@/components/StatusChip';

function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-4)}` : address;
}

function when(createdAtMs: number): string {
  return new Date(createdAtMs).toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

function Row({ run }: { run: PayrollRunView }) {
  const bodies = STATUTORY_BODIES.map((body) => {
    const entry = run.breakdown.bodies.find((candidate) => candidate.body === body);
    return { body, total: entry?.total ?? '0' };
  });

  return (
    <li className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-mono text-caption text-ink-2">
            {shortAddress(run.employee)}
          </span>
          <span className="text-caption text-ink-3">{when(run.createdAtMs)}</span>
        </div>
        <StatusChip status={run.status} className="shrink-0" />
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-caption text-ink-3">Taken home</span>
        <Money amount={run.breakdown.net} size="row" />
      </div>

      <dl className="flex flex-col gap-1 border-t border-rule pt-3">
        {bodies.map(({ body, total }) => (
          <div key={body} className="flex items-baseline justify-between gap-3">
            <dt className="text-caption text-ink-3">{STATUTORY_BODY_LABEL[body]}</dt>
            <dd className="tnum text-caption">{toDisplay(total)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-2">
          <dt className="text-caption text-ink-2">Cost to the treasury</dt>
          <dd className="tnum text-caption font-medium">
            {toDisplay(run.breakdown.employerCost)}
          </dd>
        </div>
      </dl>

      {run.status === 'paid' && run.digest ? (
        <a
          className="link self-start text-caption"
          href={`https://suiscan.xyz/testnet/tx/${run.digest}`}
          target="_blank"
          rel="noreferrer"
        >
          View the transaction
        </a>
      ) : null}

      {run.status === 'failed' ? (
        <p className="text-caption text-no">
          {run.abortCode === null
            ? 'Nothing was paid. The run did not reach a decision from the contract.'
            : `Nothing was paid. The contract refused this run on abort ${run.abortCode}.`}
        </p>
      ) : null}

      {run.status === 'pending' ? (
        <p className="text-caption text-wait">
          Recorded before signing. If it stays here, the outcome is unknown and needs
          checking by hand rather than running again.
        </p>
      ) : null}
    </li>
  );
}

export function RunHistory({ runs }: { runs: PayrollRunView[] }) {
  if (runs.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-rule bg-surface p-5 text-body text-ink-3">
        Nothing has reached the contract yet. A run is recorded here before it is
        signed, so this list shows what was attempted, not only what succeeded.
        Attempts refused before that point — an unpublished module, missing
        credentials — never get this far.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {runs.map((run) => (
        <Row key={run.id} run={run} />
      ))}
    </ul>
  );
}
