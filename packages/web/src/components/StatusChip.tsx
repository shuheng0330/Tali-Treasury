import type { ClaimChip, MandateStatus, PayrollRunStatus } from '@tali/shared';
import { CLAIM_CHIP_LABEL } from '@tali/shared';

/** `paid` means the same thing in all three, so the sets overlap by design. */
export type ChipStatus = ClaimChip | MandateStatus | PayrollRunStatus;

type Glyph = 'disc' | 'ring' | 'pulse' | 'wedge' | 'cross' | 'bar';

interface Style {
  label: string;
  glyph: Glyph;
  className: string;
  dashed: boolean;
}

const PAYROLL_LABEL: Record<Exclude<PayrollRunStatus, 'paid'>, string> = {
  pending: 'In flight',
  failed: 'Refused',
};

const MANDATE_LABEL: Record<MandateStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
};

const STYLES: Record<ChipStatus, Style> = {
  draft: { label: CLAIM_CHIP_LABEL.draft, glyph: 'ring', className: 'bg-dead-soft text-dead border-dead-line', dashed: false },
  analysing: { label: CLAIM_CHIP_LABEL.analysing, glyph: 'pulse', className: 'bg-accent-soft text-accent-ink border-accent-line', dashed: false },
  submitted: { label: CLAIM_CHIP_LABEL.submitted, glyph: 'ring', className: 'bg-accent-soft text-accent-ink border-accent-line', dashed: false },
  needs_correction: { label: CLAIM_CHIP_LABEL.needs_correction, glyph: 'wedge', className: 'bg-wait-soft text-wait border-wait-line', dashed: false },
  needs_review: { label: CLAIM_CHIP_LABEL.needs_review, glyph: 'wedge', className: 'bg-wait-soft text-wait border-wait-line', dashed: false },
  approved: { label: CLAIM_CHIP_LABEL.approved, glyph: 'ring', className: 'bg-ok-soft text-ok border-ok-line', dashed: false },
  paid: { label: CLAIM_CHIP_LABEL.paid, glyph: 'disc', className: 'bg-ok-soft text-ok border-ok-line', dashed: false },
  rejected: { label: CLAIM_CHIP_LABEL.rejected, glyph: 'cross', className: 'bg-no-soft text-no border-no-line', dashed: false },
  payment_failed: { label: CLAIM_CHIP_LABEL.payment_failed, glyph: 'cross', className: 'bg-no-soft text-no border-no-line', dashed: false },
  pending: { label: PAYROLL_LABEL.pending, glyph: 'pulse', className: 'bg-accent-soft text-accent-ink border-accent-line', dashed: false },
  failed: { label: PAYROLL_LABEL.failed, glyph: 'cross', className: 'bg-no-soft text-no border-no-line', dashed: false },
  active: { label: MANDATE_LABEL.active, glyph: 'disc', className: 'bg-ok-soft text-ok border-ok-line', dashed: false },
  expired: { label: MANDATE_LABEL.expired, glyph: 'bar', className: 'bg-dead-soft text-dead border-dead-line', dashed: false },
  revoked: { label: MANDATE_LABEL.revoked, glyph: 'bar', className: 'bg-dead-soft text-dead border-dead-line', dashed: true },
};

function GlyphMark({ glyph }: { glyph: Glyph }) {
  const stroke = 1.6;

  if (glyph === 'disc' || glyph === 'pulse') {
    return (
      <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden className={glyph === 'pulse' ? 'animate-breathe' : undefined}>
        <circle cx="5" cy="5" r="4" fill="currentColor" />
      </svg>
    );
  }

  if (glyph === 'ring') {
    return (
      <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden>
        <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth={stroke} />
      </svg>
    );
  }

  if (glyph === 'wedge') {
    return (
      <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden>
        <path d="M5 1 L9.2 8.6 H0.8 Z" fill="currentColor" />
      </svg>
    );
  }

  if (glyph === 'cross') {
    return (
      <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden>
        <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden>
      <path d="M1.5 5 H8.5" stroke="currentColor" strokeWidth={stroke + 0.2} strokeLinecap="round" />
    </svg>
  );
}

export function StatusChip({ status, className = '' }: { status: ChipStatus; className?: string }) {
  const style = STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-badge border px-2 py-0.5 text-caption font-medium ${
        style.dashed ? 'border-dashed' : ''
      } ${style.className} ${className}`}
    >
      <GlyphMark glyph={style.glyph} />
      {style.label}
    </span>
  );
}
