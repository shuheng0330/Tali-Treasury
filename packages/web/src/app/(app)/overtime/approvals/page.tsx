import Link from 'next/link';
import { STATUTORY_BODIES } from '@tali/shared';
import {
  createTestnetClient,
  readPayrollMandate,
  taliTestnetUsdcConfig,
} from '@tali/treasury-sui';

import { ApprovalQueue } from '@/components/overtime/ApprovalQueue';
import type { MandateBudget } from '@/lib/approval-summary';

export const metadata = {
  title: 'Approve overtime · Tali Treasury',
};

export const dynamic = 'force-dynamic';

/**
 * The mandate as it stands right now, read here rather than in the browser.
 *
 * A failure is a real answer: the queue still renders and still records
 * decisions, and says that what they would commit on chain is not being shown.
 * The alternative is a screen that quotes a budget nobody read.
 */
async function readMandate(): Promise<{
  mandate: MandateBudget | null;
  reason: string | null;
}> {
  const mandateId = process.env.PAYROLL_MANDATE_ID?.trim();
  const packageId = process.env.PAYROLL_PACKAGE_ID?.trim();
  if (!mandateId || !packageId) return { mandate: null, reason: null };

  try {
    const state = await readPayrollMandate(
      createTestnetClient(process.env.SUI_GRPC_URL),
      { ...taliTestnetUsdcConfig, packageId },
      mandateId,
    );

    return {
      mandate: {
        mandateId: state.id,
        spendable: state.spendable.toString(),
        maxPerRun: state.maxPerRun.toString(),
        /* The contract pairs floor `i` with recipient `i`, and the whole
           codebase writes them in `STATUTORY_BODIES` order. */
        floors: state.floors.slice(0, STATUTORY_BODIES.length).map((floor, index) => ({
          body: STATUTORY_BODIES[index]!,
          minBps: floor.minBps.toString(),
          wageCap: floor.wageCap.toString(),
        })),
        revoked: state.revoked,
        expiryMs: Number(state.expiryMs),
        fetchedAtMs: Date.now(),
      },
      reason: null,
    };
  } catch (cause) {
    return {
      mandate: null,
      reason: cause instanceof Error ? cause.message : 'Unknown Sui read error',
    };
  }
}

export default async function OvertimeApprovalsPage() {
  const { mandate, reason } = await readMandate();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Overtime</p>
        <h1 className="text-display">Approvals</h1>
        <p className="text-body text-ink-2">
          Approving raises the wage the next payroll run pays, and that run spends a
          budget fixed on chain. Every decision here shows what it commits before it is
          recorded, because the contract will not renegotiate afterwards.
        </p>
      </header>

      <ApprovalQueue mandate={mandate} mandateError={reason} />

      <Link href="/payroll" className="link self-start">
        Back to payroll
      </Link>
    </div>
  );
}
