import type { PayrollBreakdown, StatutorySplit } from '@tali/shared';

function bodyTotal(breakdown: StatutorySplit, body: 'epf' | 'socso' | 'eis') {
  const found = breakdown.bodies.find((entry) => entry.body === body);
  return {
    employee: BigInt(found?.employee ?? '0'),
    employer: BigInt(found?.employer ?? '0'),
  };
}

/**
 * What changed about this split, read off the split itself.
 *
 * Deliberately derived from the computed figures rather than from a second copy
 * of the rate table. A restatement of the rates here would be one more place
 * for them to drift from the calculator, and the wrong one would be the one on
 * screen.
 */
export function ClassNote({ breakdown }: { breakdown: PayrollBreakdown }) {
  const source = breakdown.fxConversion?.source ?? breakdown;
  const epf = bodyTotal(source, 'epf');
  const eis = bodyTotal(source, 'eis');
  const socso = bodyTotal(source, 'socso');

  const notes: string[] = [];

  if (epf.employee === 0n && epf.employer > 0n) {
    notes.push('No EPF is taken from the wage, and the employer share drops to the retirement rate.');
  }
  if (eis.employee === 0n && eis.employer === 0n) {
    notes.push('EIS does not cover this worker, so nothing is withheld for it.');
  }
  if (socso.employee > 0n && BigInt(source.gross) > 6_000_000_000n) {
    notes.push('SOCSO and EIS are charged on the first RM6,000 of wages only.');
  }

  if (notes.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1 rounded-card border border-rule bg-raised px-4 py-3">
      {notes.map((note) => (
        <li key={note} className="text-caption text-ink-2">
          {note}
        </li>
      ))}
    </ul>
  );
}
