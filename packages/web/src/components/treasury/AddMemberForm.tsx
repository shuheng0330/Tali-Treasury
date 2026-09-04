'use client';

import { useState } from 'react';
import { tryAddEventMember } from '@/lib/api/members';

const SUI_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

interface Props {
  eventId: string;
  onAdded?: () => void;
}

export function AddMemberForm({ eventId, onAdded }: Props) {
  const [walletAddress, setWalletAddress] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<
    { ok: true; name: string } | { ok: false; message: string } | null
  >(null);

  const addressTyped = walletAddress.length > 0;
  const addressInvalid = addressTyped && !SUI_ADDRESS.test(walletAddress);

  async function submit() {
    setSending(true);
    setResult(null);
    const outcome = await tryAddEventMember(eventId, { walletAddress, displayName });
    setSending(false);
    if (outcome.kind === 'added') {
      setResult({ ok: true, name: outcome.displayName });
      setWalletAddress('');
      setDisplayName('');
      onAdded?.();
    } else {
      setResult({ ok: false, message: outcome.reason });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-4">
      <span className="eyebrow">Add a member</span>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-caption text-ink-3">Wallet address</span>
          <input
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value.trim())}
            placeholder="0x…"
            className="rounded-control border border-rule bg-canvas px-3 py-2.5 font-mono text-caption outline-none focus-visible:border-accent-ink"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-caption text-ink-3">Name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-control border border-rule bg-canvas px-3 py-2.5 text-body outline-none focus-visible:border-accent-ink"
          />
        </label>
      </div>

      {addressInvalid ? (
        <p className="text-caption text-no">Not a canonical Sui address.</p>
      ) : null}

      <button
        type="button"
        className="btn btn--primary self-start"
        disabled={sending || addressInvalid || !addressTyped || !displayName.trim()}
        onClick={() => void submit()}
      >
        {sending ? 'Adding…' : 'Add member'}
      </button>

      {result && !result.ok ? (
        <p className="rounded-control border border-wait-line bg-wait-soft p-3 text-caption text-wait">
          Not added. {result.message}.
        </p>
      ) : null}
      {result?.ok ? (
        <p className="rounded-control border border-ok-line bg-ok-soft p-3 text-caption text-ok">
          {result.name} added to the roster.
        </p>
      ) : null}
    </div>
  );
}
