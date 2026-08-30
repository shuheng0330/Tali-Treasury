import type { Amount } from '@tali/shared';
import { toDisplay } from '@tali/shared';

type Size = 'inline' | 'row' | 'lead' | 'hero';

const SIZES: Record<Size, { value: string; unit: string; gap: string }> = {
  inline: { value: 'text-body', unit: 'text-caption', gap: 'gap-1' },
  row: { value: 'text-subhead', unit: 'text-caption', gap: 'gap-1' },
  lead: { value: 'text-title', unit: 'text-body', gap: 'gap-1.5' },
  hero: { value: 'text-display', unit: 'text-subhead', gap: 'gap-2' },
};

interface Props {
  amount: Amount;
  size?: Size;
  unit?: string;
  struck?: boolean;
  className?: string;
}

export function Money({ amount, size = 'inline', unit = 'USDC', struck = false, className = '' }: Props) {
  const scale = SIZES[size];

  return (
    <span className={`inline-flex items-baseline ${scale.gap} ${struck ? 'line-through decoration-1' : ''} ${className}`}>
      <span className={`tnum font-medium ${scale.value}`}>{toDisplay(amount)}</span>
      <span className={`${scale.unit} font-normal text-ink-3`}>{unit}</span>
    </span>
  );
}
