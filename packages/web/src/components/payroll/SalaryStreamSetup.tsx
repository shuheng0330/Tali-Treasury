'use client';

import type { PayrollConfigurationView, SalaryStreamRegistrationView } from '@tali/shared';
import { toBaseUnits, toDisplay } from '@tali/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { RoleNotice } from '@/components/RoleNotice';
import { Select } from '@/components/Select';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { getRegisteredSalaryStream, openSalaryStream } from '@/lib/api/payroll';
import { EMPLOYER_COPY, walletAccess } from '@/lib/wallet-access';
import { EMPLOYER_WALLET } from '@/lib/demo-config';

export function SalaryStreamSetup({ configuration }: { configuration: PayrollConfigurationView }) {
  const { address } = useWalletSession();
  const access = walletAccess(address, EMPLOYER_WALLET, EMPLOYER_COPY);
  const [amount, setAmount] = useState('1.00');
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [stream, setStream] = useState<SalaryStreamRegistrationView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'opening'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setStatus('loading');
    setError(null);
    getRegisteredSalaryStream(configuration.mandateId)
      .then((result) => {
        if (!current) return;
        setStream(result.stream);
        setStatus('ready');
      })
      .catch((reason) => {
        if (!current) return;
        setError(reason instanceof Error ? reason.message : 'The salary stream registry is unavailable.');
        setStatus('ready');
      });
    return () => { current = false; };
  }, [configuration.mandateId]);

  async function open() {
    let totalAmount: string;
    try {
      if (!/^\d+(?:\.\d{1,6})?$/.test(amount.trim())) throw new Error('precision');
      totalAmount = toBaseUnits(amount);
      if (BigInt(totalAmount) <= 0n) throw new Error('positive');
    } catch {
      setError('Enter a positive USDC amount with no more than six decimal places.');
      return;
    }
    setStatus('opening');
    setError(null);
    try {
      const result = await openSalaryStream({
        mandateId: configuration.mandateId,
        totalAmount,
        durationMinutes,
      });
      setStream(result.stream);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The salary stream could not be opened.');
    } finally {
      setStatus('ready');
    }
  }

  if (status === 'loading') {
    return <p className="text-caption text-ink-3">Checking this payroll for an existing salary stream…</p>;
  }

  if (stream) {
    return (
      <section className="flex flex-col gap-3 rounded-card border border-ok-line bg-ok-soft p-5">
        <span className="eyebrow text-ok">Salary stream opened</span>
        <p className="text-body">
          {toDisplay(stream.totalAmount, 6)} USDC is reserved for the registered employee over this vesting period.
        </p>
        <div className="flex flex-wrap gap-4 text-caption">
          <a className="link" href={`https://suiscan.xyz/testnet/tx/${stream.creationDigest}`} target="_blank" rel="noreferrer">
            View opening transaction
          </a>
          <Link className="link" href={`/earnings?payroll=${encodeURIComponent(stream.mandateId)}`}>
            See it accruing
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-rule bg-surface p-5">
      <div>
        <span className="eyebrow">Salary stream</span>
        <p className="mt-2 text-caption text-ink-3">
          Reserve a clearly labelled USDC allocation for time-based accrual. This is not a second payment of the RM30 payroll already run.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 rounded-control border border-rule bg-surface px-3 py-2">
          <span className="text-body font-medium text-ink-2">Stream total (USDC)</span>
          <input
            className="tnum bg-transparent text-body outline-none"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <Select
          label="Vesting period"
          value={String(durationMinutes)}
          onChange={(minutes) => setDurationMinutes(Number(minutes))}
          options={[
            { value: '5', label: '5 minutes' },
            { value: '10', label: '10 minutes' },
            { value: '30', label: '30 minutes' },
          ]}
        />
      </div>
      <RoleNotice access={access} />
      <button className="btn btn--primary btn--block" type="button" disabled={!access.permitted || status === 'opening'} onClick={open}>
        {status === 'opening' ? 'Opening on Sui…' : 'Open salary stream'}
      </button>
      {error ? <p className="text-caption text-no">{error}</p> : null}
    </section>
  );
}
