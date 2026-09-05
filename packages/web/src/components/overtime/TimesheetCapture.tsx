'use client';

import { useEffect, useState } from 'react';

import { tryAnalyzeTimesheet, type OvertimeDraft } from '@/lib/api/overtime';

interface Props {
  disabled?: boolean;
  onDraft: (draft: OvertimeDraft) => void;
}

type Status = 'idle' | 'reading' | 'read' | 'failed';

export function TimesheetCapture({ disabled = false, onDraft }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  async function onFile(file: File) {
    setPhotoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
    setStatus('reading');
    setNote(null);

    const result = await tryAnalyzeTimesheet(file);
    if (result.data === null) {
      setStatus('failed');
      setNote(result.reason);
      return;
    }

    onDraft(result.data);
    setStatus('read');
    setNote(result.data.note.trim() || null);
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        className={`btn btn--block h-14 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-ink ${
          disabled || status === 'reading'
            ? 'cursor-not-allowed border-rule bg-raised text-ink-3'
            : 'btn--ghost cursor-pointer'
        }`}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
          <circle cx="12" cy="13" r="3.6" />
        </svg>
        <span>{status === 'reading' ? 'Reading…' : 'Photograph a timesheet'}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={disabled || status === 'reading'}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
            event.target.value = '';
          }}
        />
      </label>

      {photoUrl ? (
        <div className="relative overflow-hidden rounded-card border border-rule bg-raised">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt="The timesheet you photographed"
            className="max-h-40 w-full object-contain"
          />
          {status === 'reading' ? (
            <span className="absolute inset-0 animate-breathe bg-accent/10" aria-hidden />
          ) : null}
        </div>
      ) : null}

      {status === 'reading' ? (
        <p className="text-caption text-ink-2" aria-live="polite">
          Reading your timesheet…
        </p>
      ) : null}

      {status === 'read' ? (
        <p className="text-caption text-ink-2" aria-live="polite">
          {note ?? 'Read from your timesheet. Check anything marked below before you submit.'}
        </p>
      ) : null}

      {status === 'failed' ? (
        <p className="rounded-card border border-wait-line bg-wait-soft p-4 text-caption text-wait" aria-live="polite">
          <span className="font-medium">
            Couldn&rsquo;t read this timesheet. Enter the hours below.
          </span>{' '}
          <span className="text-ink-2">{note ? `The reader said: ${note}.` : ''}</span>
        </p>
      ) : null}
    </div>
  );
}
