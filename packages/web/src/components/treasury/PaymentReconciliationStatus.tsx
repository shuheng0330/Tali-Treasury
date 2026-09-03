'use client';

import { EXPLORER, type Claim } from '@tali/shared';

interface Props {
  claim: Claim;
  pending: boolean;
  onCheck: (claimId: string) => void;
}

function shortDigest(digest: string) {
  return `${digest.slice(0, 10)}…${digest.slice(-8)}`;
}

export function PaymentReconciliationStatus({ claim, pending, onCheck }: Props) {
  if (claim.state === 'paying' && claim.paymentAttempt) {
    return (
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <span className="font-mono text-caption text-ink-3" title={claim.paymentAttempt.digest}>
          {shortDigest(claim.paymentAttempt.digest)}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => onCheck(claim.id)}
          className="btn btn--ghost h-9 px-3 text-caption"
        >
          {pending ? 'Checking Sui…' : 'Check payment status'}
        </button>
      </div>
    );
  }

  const digest = claim.payment?.digest;
  if ((claim.state === 'paid' || claim.state === 'payment_failed') && digest) {
    return (
      <a
        href={EXPLORER.tx(digest).suiscan}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex text-caption text-accent underline underline-offset-4"
      >
        View transaction
      </a>
    );
  }

  return null;
}
