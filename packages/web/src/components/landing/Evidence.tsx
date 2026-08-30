import { EXPLORER } from '@tali/shared';
import { AFTERMATH, LIVE_MANDATE_ID, ON_CHAIN_RUNS } from '@/lib/evidence';

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
        className="text-caption text-accent underline underline-offset-4"
      >
        SuiVision
      </a>
      <a
        href={links.suiscan}
        target="_blank"
        rel="noreferrer"
        className="text-caption text-accent underline underline-offset-4"
      >
        Suiscan
      </a>
    </span>
  );
}

export function Evidence() {
  return (
    <div className="flex flex-col rounded-card border border-rule bg-surface">
      <ul className="flex flex-col gap-6 py-2">
        {ON_CHAIN_RUNS.map((run) => {
          const refused = run.kind === 'refused';

          return (
            <li key={run.digest} className="flex flex-col gap-2 px-6">
              <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span
                  className={`rounded-badge px-2 py-1 text-label uppercase ${
                    refused ? 'bg-no-soft text-no' : 'bg-ok-soft text-ok'
                  }`}
                >
                  {refused ? 'Refused' : 'Allowed'}
                </span>
                {run.abort ? (
                  <span className="font-mono text-caption text-ink-3">
                    abort {run.abort.code} · {run.abort.key}
                  </span>
                ) : null}
              </span>

              <span className="text-subhead">{run.headline}</span>
              <span className="text-caption text-ink-2">{run.detail}</span>
              <Digest digest={run.digest} />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1 border-t border-rule px-6 py-6">
        <p className="text-body text-ink-2">
          After both refusals the mandate still held{' '}
          <span className="tnum font-medium">{AFTERMATH.budgetRemaining}</span> and had spent{' '}
          <span className="tnum font-medium">{AFTERMATH.amountSpent}</span> — the same figures
          as before they were submitted. Neither refusal emitted a{' '}
          <span className="font-mono">PaymentMade</span> event.
        </p>
        <p className="text-caption text-ink-3">
          The agent still paid{' '}
          <span className="tnum">{AFTERMATH.gasBurnedByRefusals}</span> in gas to be turned
          down, which is the part that is hard to fake: a refusal that costs nothing did not
          happen on a chain. Recorded against mandate{' '}
          <a
            href={EXPLORER.object(LIVE_MANDATE_ID).suivision}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-accent underline underline-offset-4"
          >
            {LIVE_MANDATE_ID.slice(0, 8)}…{LIVE_MANDATE_ID.slice(-6)}
          </a>
          , which holds Circle testnet USDC.
        </p>
      </div>
    </div>
  );
}
