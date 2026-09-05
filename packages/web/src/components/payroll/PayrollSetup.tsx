'use client';

import { useDAppKit } from '@mysten/dapp-kit-react';
import { buildCreatePayrollMandateTransaction } from '@tali/treasury-sui';
import { toDisplay, type RegisterPayrollResponse } from '@tali/shared';
import { useEffect, useState } from 'react';

import { RoleNotice } from '@/components/RoleNotice';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';
import { EMPLOYER_WALLET, PAYROLL_EMPLOYEE } from '@/lib/demo-config';
import { SETUP_COPY, walletAccess } from '@/lib/wallet-access';
import { previewPayrollSetup, registerPayrollSetup } from '@/lib/api/payroll-setup';
import { initialPayrollEmployee } from '@/lib/payroll-setup-defaults';
import type { PayrollSetupPreview } from '@/server/payroll/setup';

/**
 * Both fields carried `className="input"`, and no `.input` rule exists in the
 * stylesheet or in Tailwind's output — so the two controls on the primary
 * employer screen rendered with no border, padding or background at all.
 *
 * Matching Create Expense Treasury rather than adding an `.input` rule: the two
 * setup screens link to each other from their own footers, and a reader who
 * follows that link should not find a different form language on the other side.
 */
const FIELD = 'flex flex-col gap-1 rounded-control border border-rule bg-surface px-3 py-2';
const INPUT = 'bg-transparent text-body outline-none disabled:opacity-60';
const SUI_DIGEST = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

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
  /* Advisory only — the preview and register endpoints refuse a wallet that is
     not the employer regardless. It is here so the refusal arrives before the
     form is filled in rather than after, where it reads as a malfunction. */
  const access = walletAccess(wallet.address, EMPLOYER_WALLET, SETUP_COPY);
  const [employee, setEmployee] = useState(() =>
    initialPayrollEmployee(PAYROLL_EMPLOYEE, wallet.address),
  );
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [preview, setPreview] = useState<PayrollSetupPreview | null>(null);
  const [status, setStatus] = useState<'idle' | 'previewing' | 'ready' | 'signing' | 'verifying' | 'registered'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [existingDigest, setExistingDigest] = useState('');
  const [registration, setRegistration] = useState<RegisterPayrollResponse | null>(null);

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

  async function registerExistingPayroll() {
    const transactionDigest = existingDigest.trim();
    if (!SUI_DIGEST.test(transactionDigest)) {
      setError('Enter the finalized Sui transaction digest for the existing payroll setup.');
      return;
    }
    setStatus('verifying');
    setError(null);
    setRegistration(null);
    try {
      const registered = await registerPayrollSetup(transactionDigest);
      setDigest(transactionDigest);
      setRegistration(registered);
      setStatus('registered');
    } catch (reason) {
      setStatus('idle');
      setError(reason instanceof Error ? reason.message : 'Payroll registration is unavailable.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-card border border-rule bg-surface p-5">
        <p className="eyebrow">Signed in as</p>
        <p className="mt-2 break-all font-mono text-caption text-ink-2">
          {wallet.address ?? 'Connect your wallet to continue'}
        </p>
      </div>

      <RoleNotice access={access} />

      <div className="flex flex-col gap-4 rounded-card border border-rule bg-surface p-5">
        <label className={FIELD}>
          <span className="text-caption text-ink-2">Employee wallet</span>
          <input className={`${INPUT} font-mono text-caption`} value={employee} onChange={(event) => {
            setEmployee(event.target.value.trim()); setPreview(null); setStatus('idle');
          }} />
        </label>
        <label className={FIELD}>
          <span className="text-caption text-ink-2">Payroll expires</span>
          <input className={INPUT} type="date" value={expiry} onChange={(event) => {
            setExpiry(event.target.value); setPreview(null); setStatus('idle');
          }} />
        </label>
        <div className="grid grid-cols-2 gap-3 rounded-control bg-raised p-4">
          <div><p className="eyebrow">Monthly wage</p><p className="text-subhead">RM30</p></div>
          <div><p className="eyebrow">Money set aside</p><p className="text-subhead">RM50</p></div>
        </div>
        <button className="btn btn--primary btn--block" type="button" onClick={loadPreview}
          disabled={!access.permitted || status === 'previewing' || status === 'signing' || !employee || !expiry}>
          {status === 'previewing' ? 'Checking…' : 'Check the details'}
        </button>
      </div>

      <div className="flex flex-col gap-4 rounded-card border border-rule bg-surface p-5">
        <div>
          <p className="eyebrow">Already set one up?</p>
          <p className="mt-2 text-caption text-ink-2">
            Paste the transaction ID to link it to this app. Nothing new is created and no
            money moves.
          </p>
        </div>
        <label className={FIELD}>
          <span className="text-caption text-ink-2">Transaction ID</span>
          <input
            className={`${INPUT} font-mono text-caption`}
            value={existingDigest}
            onChange={(event) => setExistingDigest(event.target.value.trim())}
            placeholder="Paste the transaction ID"
          />
        </label>
        <button
          className="btn btn--ghost btn--block"
          type="button"
          onClick={registerExistingPayroll}
          disabled={!access.permitted || status === 'verifying' || !SUI_DIGEST.test(existingDigest)}
        >
          {status === 'verifying' ? 'Checking…' : 'Link it to this app'}
        </button>
      </div>

      {preview ? (
        <div className="flex flex-col gap-4 rounded-card border border-ok-line bg-ok-soft p-5">
          <div>
            <p className="eyebrow text-ok">What you will pay in</p>
            <p className="mt-2 text-title">{toDisplay(preview.budgetUsdc, 6)} USDC</p>
            <p className="text-caption text-ink-2">
              RM50 at today&rsquo;s rate of {preview.rate.myrPerUsd} to the dollar
            </p>
          </div>
          {/* `truncate` alone does not shrink a flex item: its default
              min-width is its content, so a 66-character address pushed the row
              wider than the card it sits in. */}
          <dl className="grid gap-2 text-caption text-ink-2">
            <div className="flex justify-between gap-4"><dt className="shrink-0">Employee</dt><dd className="min-w-0 truncate font-mono">{preview.employee}</dd></div>
            <div className="flex justify-between gap-4"><dt className="shrink-0">Runs the payroll</dt><dd className="min-w-0 truncate font-mono">{preview.capRecipient}</dd></div>
            <div className="flex justify-between gap-4"><dt className="shrink-0">Expires</dt><dd>{new Date(preview.expiryMs).toLocaleDateString('en-MY')}</dd></div>
            <div className="flex justify-between gap-4"><dt className="shrink-0">Covers</dt><dd>EPF · SOCSO · EIS</dd></div>
          </dl>
          <p className="text-caption text-ink-2">
            None of this can be changed afterwards.
          </p>
          <button className="btn btn--primary btn--block" type="button" onClick={createPayroll}
            disabled={!access.permitted || status === 'signing' || status === 'verifying' || status === 'registered'}>
            {status === 'signing' ? 'Check your wallet…' : status === 'verifying' ? 'Almost done…' : status === 'registered' ? 'Payroll is ready' : 'Create and fund payroll'}
          </button>
        </div>
      ) : null}

      {error ? <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no">{error}</p> : null}
      {digest && !registration && status === 'verifying' ? (
        <button className="btn btn--ghost btn--block" type="button" onClick={retryRegistration}>
          Try again (this will not take more money)
        </button>
      ) : null}
      {digest ? (
        <p className="rounded-card border border-ok-line bg-ok-soft p-4 text-caption text-ok">
          {registration ? 'Payroll is set up and ready to run. ' : 'Your payment went through. Linking it to the app… '}
          <a className="link" href={`https://suiscan.xyz/testnet/tx/${digest}`} target="_blank" rel="noreferrer">View transaction</a>
        </p>
      ) : null}
    </div>
  );
}
