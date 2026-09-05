import { EXPLORER } from '@tali/shared';
import {
  AFTERMATH,
  LIVE_MANDATE_ID,
  ON_CHAIN_RUNS,
  PAYROLL_AFTERMATH,
  PAYROLL_MANDATE_ID,
  type OnChainRun,
} from '@/lib/evidence';

const CHIP: Record<OnChainRun['kind'], { label: string; className: string }> = {
  allowed: { label: 'Allowed', className: 'border-ok-line bg-ok-soft text-ok' },
  refused: { label: 'Refused', className: 'border-no-line bg-no-soft text-no' },
  /* Not one of the five status colours, because a publish is not a status. The
     mandate reached no verdict on it, and painting it green would say it did. */
  published: { label: 'Published', className: 'border-rule-strong bg-raised text-ink-2' },
};

function Mark({ kind }: { kind: OnChainRun['kind'] }) {
  if (kind === 'allowed') {
    return (
      <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden>
        <circle cx="5" cy="5" r="4" fill="currentColor" />
      </svg>
    );
  }

  if (kind === 'refused') {
    return (
      <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden>
        <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden>
      <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

function Digest({ digest }: { digest: string }) {
  const links = EXPLORER.tx(digest);

  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="break-all font-mono text-caption text-ink-2">
        {digest.slice(0, 10)}…{digest.slice(-8)}
      </span>
      <a
        href={links.suivision}
        target="_blank"
        rel="noreferrer"
        className="link text-caption"
      >
        SuiVision
      </a>
      <a
        href={links.suiscan}
        target="_blank"
        rel="noreferrer"
        className="link text-caption"
      >
        Suiscan
      </a>
    </span>
  );
}

export function Evidence() {
  return (
    <div className="flex flex-col overflow-hidden rounded-panel border border-rule bg-surface">
      <ul className="flex flex-col gap-8 py-6">
        {ON_CHAIN_RUNS.map((run) => {
          const chip = CHIP[run.kind];

          return (
            <li key={run.digest} className="flex flex-col gap-2 px-6 sm:px-8">
              <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-badge border px-3 py-1.5 text-label uppercase ${chip.className}`}
                >
                  <Mark kind={run.kind} />
                  {chip.label}
                </span>
                {run.abort ? (
                  <span className="tnum font-mono text-caption text-ink-3">
                    abort {run.abort.code} · {run.abort.key}
                  </span>
                ) : null}
              </span>

              <span className="font-display text-subhead">{run.headline}</span>
              <span className="text-caption text-ink-2">{run.detail}</span>
              <Digest digest={run.digest} />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 border-t border-rule px-6 py-6 sm:px-8">
        <p className="text-body text-ink-2">
          After the short-EPF run was refused, the payroll mandate still held{' '}
          <span className="tnum font-medium">{PAYROLL_AFTERMATH.budgetRemaining}</span> and had
          still paid exactly{' '}
          <span className="tnum font-medium">{PAYROLL_AFTERMATH.totalPaid}</span> across{' '}
          <span className="tnum">{PAYROLL_AFTERMATH.runCount}</span> run — the figures from
          before it was submitted. The wage did not go out either, which is the whole point:
          the worker and the three bodies move together or not at all. It ran against mandate{' '}
          <a
            href={EXPLORER.object(PAYROLL_MANDATE_ID).suivision}
            target="_blank"
            rel="noreferrer"
            className="link font-mono"
          >
            {PAYROLL_MANDATE_ID.slice(0, 8)}…{PAYROLL_MANDATE_ID.slice(-6)}
          </a>
          , and cost the signer <span className="tnum">{PAYROLL_AFTERMATH.gasBurnedByRefusal}</span>{' '}
          in gas to be told no.
        </p>
        <p className="text-body text-ink-2">
          After the two expense refusals that mandate still held{' '}
          <span className="tnum font-medium">{AFTERMATH.budgetRemaining}</span> and had spent{' '}
          <span className="tnum font-medium">{AFTERMATH.amountSpent}</span> — the same figures
          as before they were submitted. Neither refusal emitted a{' '}
          <span className="font-mono">PaymentMade</span> event.
        </p>
        <p className="text-caption text-ink-3">
          The agent still paid{' '}
          <span className="tnum">{AFTERMATH.gasBurnedByRefusals}</span> in gas to be turned
          down, which is the part that is hard to fake: a refusal that costs nothing did not
          happen on a chain. The first three ran against mandate{' '}
          <a
            href={EXPLORER.object(LIVE_MANDATE_ID).suivision}
            target="_blank"
            rel="noreferrer"
            className="link font-mono"
          >
            {LIVE_MANDATE_ID.slice(0, 8)}…{LIVE_MANDATE_ID.slice(-6)}
          </a>
          , which holds Circle testnet USDC. The reimbursement below them was paid from the
          separate single-wallet demo mandate, and the upgrade from no mandate at all.
        </p>
      </div>
    </div>
  );
}
