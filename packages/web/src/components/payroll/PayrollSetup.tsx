'use client';

import { useDAppKit } from '@mysten/dapp-kit-react';
import { buildCreatePayrollMandateTransaction } from '@tali/treasury-sui';
import { toDisplay } from '@tali/shared';
import { useEffect, useState } from 'react';

import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { previewPayrollSetup, registerPayrollSetup } from '@/lib/api/payroll-setup';
import { PAYROLL_EMPLOYEE } from '@/lib/demo-config';
import { initialPayrollEmployee } from '@/lib/payroll-setup-defaults';
import type { PayrollSetupPreview } from '@/server/payroll/setup';
import type { PayrollSetupRegistration } from '@/server/payroll/setup-registration';

function defaultExpiry(): string {
  const date = new Date();
  date.setDate(date.getDate() + 26);
  return date.toISOString().slice(0, 10);
}

function walletMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('reject') || message.includes('cancel') || message.includes('denied')) {
    return 'The wallet request was cancelled. No payroll was created.';
  }
  return error instanceof Error ? error.message : 'Payroll setup could not be completed.';
}

export function PayrollSetup() {
  const wallet = useWalletSession();
  const dapp = useDAppKit();
  const [employee, setEmployee] = useState(() =>
    initialPayrollEmployee(PAYROLL_EMPLOYEE, wallet.address),
  );
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [preview, setPreview] = useState<PayrollSetupPreview | null>(null);
  const [status, setStatus] = useState<'idle' | 'previewing' | 'ready' | 'signing' | 'verifying' | 'registered'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [registration, setRegistration] = useState<PayrollSetupRegistration | null>(null);

  useEffect(() => {
    if (!employee && wallet.address) {
      setEmployee(initialPayrollEmployee(PAYROLL_EMPLOYEE, wallet.address));
    }
  }, [employee, wallet.address]);

  async function loadPreview() {
    if (wallet.status !== 'authenticated') {
      setError('Connect and sign in with the configured employer wallet first.');
      return;
    }
    if (wallet.address !== wallet.connectedAddress) {
      setError('The connected wallet does not match the signed-in wallet. Sign in again.');
      return;
    }
    const expiryMs = Date.parse(`${expiry}T23:59:59+08:00`);
    if (!Number.isSafeInteger(expiryMs)) {
      setError('Choose a valid expiry date.');
      return;
    }
    setStatus('previewing');
    setError(null);
    setDigest(null);
    setRegistration(null);
    try {
      const value = await previewPayrollSetup({ employee, expiryMs });
      setPreview(value);
      setStatus('ready');
    } catch (reason) {
      setPreview(null);
      setStatus('idle');
      setError(reason instanceof Error ? reason.message : 'Payroll preview is unavailable.');
    }
  }

  async function createPayroll() {
    if (
      !preview ||
      wallet.status !== 'authenticated' ||
      wallet.address !== wallet.connectedAddress ||
      wallet.address !== preview.employer
    ) {
      setError('The signed-in employer no longer matches this preview. Refresh it first.');
      return;
    }
    setStatus('signing');
    setError(null);
    let submittedDigest: string | null = null;
    try {
      const transaction = buildCreatePayrollMandateTransaction(
        { packageId: preview.packageId, coinType: preview.coinType },
        {
          sender: preview.employer,
          approvedEmployees: [preview.employee],
          capRecipient: preview.capRecipient,
          budget: BigInt(preview.budgetUsdc),
          floors: preview.floors.map((floor) => ({
            recipient: floor.recipient,
            minBps: BigInt(floor.minBps),
            wageCap: BigInt(floor.wageCapUsdc),
          })),
          netMinBps: BigInt(preview.netMinBps),
          maxPerRun: BigInt(preview.maxPerRunUsdc),
          expiryMs: BigInt(preview.expiryMs),
        },
      );
      const result = await dapp.signAndExecuteTransaction({ transaction, network: 'testnet' });
      if (result.$kind === 'FailedTransaction') {
        throw new Error(result.FailedTransaction.status.error?.message ?? 'Sui refused the setup transaction.');
      }
      const transactionDigest = result.Transaction.digest;
      submittedDigest = transactionDigest;
      setDigest(transactionDigest);
      setStatus('verifying');
      const registered = await registerPayrollSetup(transactionDigest);
      setRegistration(registered);
      setStatus('registered');
    } catch (reason) {
      setStatus(submittedDigest ? 'verifying' : 'ready');
      setError(walletMessage(reason));
    }
  }

  async function retryRegistration() {
    if (!digest) return;
    setStatus('verifying');
    setError(null);
    try {
      setRegistration(await registerPayrollSetup(digest));
      setStatus('registered');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payroll registration is unavailable.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-card border border-rule bg-surface p-5">
        <p className="eyebrow">Authenticated employer</p>
        <p className="mt-2 break-all font-mono text-caption text-ink-2">
          {wallet.address ?? 'Connect and sign in with Slush'}
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-card border border-rule bg-surface p-5">
        <label className="flex flex-col gap-2 text-body">
          Employee wallet
          <input className="input font-mono" value={employee} onChange={(event) => {
            setEmployee(event.target.value.trim()); setPreview(null); setStatus('idle');
          }} />
        </label>
        <label className="flex flex-col gap-2 text-body">
          Payroll expires
          <input className="input" type="date" value={expiry} onChange={(event) => {
            setExpiry(event.target.value); setPreview(null); setStatus('idle');
          }} />
        </label>
        <div className="grid grid-cols-2 gap-3 rounded-control bg-raised p-4">
          <div><p className="eyebrow">Demo wage</p><p className="text-subhead">RM30</p></div>
          <div><p className="eyebrow">Total budget</p><p className="text-subhead">RM50 equivalent</p></div>
        </div>
        <button className="btn btn--primary btn--block" type="button" onClick={loadPreview}
          disabled={status === 'previewing' || status === 'signing' || !employee || !expiry}>
          {status === 'previewing' ? 'Getting live quote…' : 'Preview payroll setup'}
        </button>
      </div>

      {preview ? (
        <div className="flex flex-col gap-4 rounded-card border border-ok-line bg-ok-soft p-5">
          <div>
            <p className="eyebrow text-ok">Live Testnet preview</p>
            <p className="mt-2 text-title">{toDisplay(preview.budgetUsdc, 6)} USDC</p>
            <p className="text-caption text-ink-2">
              Funds the RM50 ceiling · 1 USD = {preview.rate.myrPerUsd} MYR · 1 USDC = 1 USD
            </p>
          </div>
          <dl className="grid gap-2 text-caption text-ink-2">
            <div className="flex justify-between gap-4"><dt>Approved employee</dt><dd className="truncate font-mono">{preview.employee}</dd></div>
            <div className="flex justify-between gap-4"><dt>PayrollCap recipient</dt><dd className="truncate font-mono">{preview.capRecipient}</dd></div>
            <div className="flex justify-between gap-4"><dt>Expiry</dt><dd>{new Date(preview.expiryMs).toLocaleDateString('en-MY')}</dd></div>
            <div className="flex justify-between gap-4"><dt>Statutory rules</dt><dd>EPF · SOCSO · EIS</dd></div>
          </dl>
          <p className="text-caption text-ink-2">
            Your wallet will spend Testnet USDC and gas. These rules and the employee allowlist are immutable for this mandate.
          </p>
          <button className="btn btn--primary btn--block" type="button" onClick={createPayroll}
            disabled={status === 'signing' || status === 'verifying' || status === 'registered'}>
            {status === 'signing' ? 'Check your wallet…' : status === 'verifying' ? 'Verifying and registering…' : status === 'registered' ? 'Payroll registered' : 'Create and fund PayrollMandate'}
          </button>
        </div>
      ) : null}

      {error ? <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">{error}</p> : null}
      {digest && !registration && status === 'verifying' ? (
        <button className="btn btn--ghost btn--block" type="button" onClick={retryRegistration}>
          Retry registration (do not fund again)
        </button>
      ) : null}
      {digest ? (
        <p className="rounded-card border border-ok-line bg-ok-soft p-4 text-caption text-ok">
          {registration ? `Registered mandate ${registration.mandateId.slice(0, 10)}… ` : 'The wallet transaction succeeded; verification or registration is still pending. '}
          <a className="link" href={`https://suiscan.xyz/testnet/tx/${digest}`} target="_blank" rel="noreferrer">View transaction</a>
        </p>
      ) : null}
    </div>
  );
}
