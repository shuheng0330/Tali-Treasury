import type { ReconcileClaimResponse } from '@tali/shared';

interface PollOptions {
  attempts?: number;
  intervalMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
}

const defaultWait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function pollPaymentReconciliation(
  reconcile: () => Promise<ReconcileClaimResponse>,
  options: PollOptions = {},
): Promise<ReconcileClaimResponse> {
  const attempts = options.attempts ?? 10;
  const intervalMs = options.intervalMs ?? 2000;
  const wait = options.wait ?? defaultWait;
  let latest: ReconcileClaimResponse | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await reconcile();
    if (latest.status !== 'pending') return latest;
    if (attempt + 1 < attempts) await wait(intervalMs);
  }

  if (latest === null) {
    throw new Error('Reconciliation requires at least one attempt');
  }
  return latest;
}
