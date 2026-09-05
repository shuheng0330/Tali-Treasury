import type { OvertimeStatus } from '@tali/shared';

/**
 * `StatusChip` covers all four of these words, but not what they mean here:
 * `paid` on an expense claim is money that has left the treasury, and on an
 * overtime claim it is an hour that rode a payroll run. Same glyph convention,
 * this screen's vocabulary.
 */
type Glyph = 'ring' | 'disc' | 'cross';

const STYLES: Record<OvertimeStatus, { label: string; glyph: Glyph; className: string }> = {
  submitted: {
    label: 'With the employer',
    glyph: 'ring',
    className: 'bg-accent-soft text-accent-ink border-accent-line',
  },
  approved: {
    label: 'Approved',
    glyph: 'ring',
    className: 'bg-ok-soft text-ok border-ok-line',
  },
  rejected: {
    label: 'Rejected',
    glyph: 'cross',
    className: 'bg-no-soft text-no border-no-line',
  },
  paid: {
    label: 'Paid in payroll',
    glyph: 'disc',
    className: 'bg-ok-soft text-ok border-ok-line',
  },
};

function GlyphMark({ glyph }: { glyph: Glyph }) {
  if (glyph === 'disc') {
    return (
      <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden>
        <circle cx="5" cy="5" r="4" fill="currentColor" />
      </svg>
    );
  }

  if (glyph === 'ring') {
    return (
      <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden>
        <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden>
      <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function OvertimeStatusChip({
  status,
  className = '',
}: {
  status: OvertimeStatus;
  className?: string;
}) {
  const style = STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-badge border px-2 py-0.5 text-caption font-medium ${style.className} ${className}`}
    >
      <GlyphMark glyph={style.glyph} />
      {style.label}
    </span>
  );
}
