import Link from 'next/link';
import { STATUTORY_BODIES } from '@tali/shared';
import {
  createTestnetClient,
  readPayrollMandate,
  taliTestnetUsdcConfig,
} from '@tali/treasury-sui';

import { ApprovalQueue } from '@/components/overtime/ApprovalQueue';
import type { MandateBudget } from '@/lib/approval-summary';
import { requireEmployerWallet } from '@/server/auth/authorization';
import { getBackendServices } from '@/server/dependencies';

export const metadata = {
  title: 'Approvals · Tali Treasury',
};

export const dynamic = 'force-dynamic';

/**
 * The mandate as it stands right now, read here rather than in the browser.
 *
 * A failure is a real answer: the queue still renders and still records
 * decisions, and says that what they would commit on chain is not being shown.
 * The alternative is a screen that quotes a budget nobody read.
 */
/**
 * The payroll this screen is actually about, which is the one the employer
 * registered rather than the one the deployment was seeded with.
 *
 * This used to read `PAYROLL_MANDATE_ID` straight from the environment. That
 * value names a single mandate fixed at deploy time, so once an employer funded
 * a new payroll through the app the queue went on quoting the old one's budget
 * — and since the seeded mandate had already been drained by an earlier run,
 * every overtime approval was projected against 2.317095 USDC that had nothing
 * to do with the employee being approved. Funding a fresh mandate changed
 * nothing on screen, because nothing on screen was reading it.
 *
 * The registry is the authority: `/payroll` already picks its mandate from
 * there. Newest wins, because that is the one a run would spend from. The
 * environment stays as the fallback for a deployment with nothing registered.
 */
async function registeredPayroll(): Promise<{ mandateId: string; packageId: string } | null> {
  try {
    const services = getBackendServices();
    const configurations = await services.payrollConfigurations.list(requireEmployerWallet());
    const latest = configurations
      .slice()
      .sort((a, b) => b.registeredAtMs - a.registeredAtMs)[0];
    return latest ? { mandateId: latest.mandateId, packageId: latest.packageId } : null;
  } catch {
    /* A registry that cannot be read is not a reason to show nothing; the
       environment still names a mandate, and the screen says when it failed. */
    return null;
  }
}

async function readMandate(): Promise<{
  mandate: MandateBudget | null;
  reason: string | null;
}> {
  const registered = await registeredPayroll();
  const mandateId = registered?.mandateId ?? process.env.PAYROLL_MANDATE_ID?.trim();
  const packageId = registered?.packageId ?? process.env.PAYROLL_PACKAGE_ID?.trim();
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
        <h1 className="text-display">Approvals</h1>
        <p className="text-body text-ink-2">
          Overtime and leave, waiting on you. Approving overtime raises the wage the next
          payroll run pays, and that run spends a budget fixed on chain. Every decision here
          shows what it commits before it is recorded, because the contract will not
          renegotiate afterwards.
        </p>
      </header>

      <ApprovalQueue mandate={mandate} mandateError={reason} />

      <Link href="/payroll" className="link self-start">
        Run payroll
      </Link>
    </div>
  );
}
