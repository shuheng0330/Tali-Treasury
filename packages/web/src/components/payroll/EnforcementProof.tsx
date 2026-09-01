'use client';

import { useState } from 'react';
import { toDisplay } from '@tali/shared';
import type { SampleEmployee } from '@/lib/mock/payroll';
import { Breakdown } from './Breakdown';

/**
 * The floor is on the amount, not on the presence of an address, so the honest
 * demonstration underpays EPF rather than removing it. The payment still
 * carries an EPF line; the contract still refuses it.
 */
export function EnforcementProof({ person }: { person: SampleEmployee }) {
  const [shortEpf, setShortEpf] = useState(false);

  const epf = person.breakdown.bodies.find((body) => body.body === 'epf');
  const floorBps = 2300n;
  const required = (BigInt(person.breakdown.gross) * floorBps) / 10000n;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={shortEpf}
            onChange={(event) => setShortEpf(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
          />
          <span className="flex flex-col gap-1">
            <span className="text-body font-medium">Underpay EPF</span>
            <span className="text-caption text-ink-2">
              Send one base unit to EPF instead of {toDisplay(epf?.total ?? '0')}, and
              keep the difference. Everything else about the run stays correct.
            </span>
          </span>
        </label>
      </div>

      <Breakdown breakdown={person.breakdown} shortedBody={shortEpf ? 'epf' : null} />

      {shortEpf ? (
        <div className="flex flex-col gap-2 rounded-card border border-stop-line bg-stop-soft p-5">
          <span className="eyebrow text-stop">The contract refuses this</span>
          <p className="text-body text-ink-2">
            <span className="font-medium text-stop">Abort 24, statutory short.</span> EPF
            must receive at least {toDisplay(required.toString())} on a gross of{' '}
            {toDisplay(person.breakdown.gross)}. Nothing moves: the worker is not paid
            either, because the payment is one transaction and it reverted whole.
          </p>
          <p className="text-caption text-ink-3">
            The address is still in the payment. Presence was never the check.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-card border border-ok-line bg-ok-soft p-5">
          <span className="eyebrow text-ok">The contract accepts this</span>
          <p className="text-body text-ink-2">
            Four recipients paid in one transaction, for a total of{' '}
            {toDisplay(person.breakdown.employerCost)}. The worker cannot be paid without
            EPF, SOCSO and EIS being paid in the same moment.
          </p>
        </div>
      )}

      <button type="button" className="btn btn--primary btn--block" disabled>
        {shortEpf ? 'Submit the underpaid run' : 'Run payroll'}
      </button>
      <p className="text-caption text-ink-3">
        Both outcomes become real testnet transactions once the payroll module is
        published. Today this screen shows the decision, not a broadcast.
      </p>
    </div>
  );
}
