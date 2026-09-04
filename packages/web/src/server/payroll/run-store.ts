import type { PayrollRunRepository } from './ports';
import { PayrollRunsTableMissingError } from '../supabase/payroll-run-repository';

/**
 * A repository that reports whether what it just did will survive a restart.
 *
 * The history screen has to say which it is. A list of runs that quietly
 * disappears on the next deploy, presented as a record, is the kind of thing
 * this codebase is supposed to refuse to do.
 */
export interface PayrollRunStore extends PayrollRunRepository {
  persisted(): boolean;
  reason(): string | null;
}

export function memoryOnlyStore(
  backup: PayrollRunRepository,
  reason: string,
): PayrollRunStore {
  return { ...backup, persisted: () => false, reason: () => reason };
}

/**
 * Uses the database, and falls back to memory only for the one thing that can
 * legitimately be missing before the migration is applied.
 *
 * Once a run has been written to memory the store stays there: the rest of that
 * run's life has to find it. Before that point every call retries the database,
 * so applying the migration takes effect without a restart.
 */
export function fallbackStore(
  primary: PayrollRunRepository,
  backup: PayrollRunRepository,
): PayrollRunStore {
  const missing = 'the payroll_runs table has not been created yet';
  let latched = false;
  let usedBackup = false;
  /* Nothing has been demonstrated until something has actually been asked of
     the database. Reporting persistence before the first call would make the
     banner depend on the order the page happens to call things in. */
  let proven = false;

  async function attempt<T>(
    action: (repository: PayrollRunRepository) => Promise<T>,
    latchOnFallback: boolean,
  ): Promise<T> {
    if (latched) return action(backup);

    try {
      const result = await action(primary);
      usedBackup = false;
      proven = true;
      return result;
    } catch (error) {
      if (!(error instanceof PayrollRunsTableMissingError)) throw error;
      usedBackup = true;
      if (latchOnFallback) latched = true;
      return action(backup);
    }
  }

  return {
    create: (input) => attempt((repository) => repository.create(input), true),
    markPaid: (runId, digest) =>
      attempt((repository) => repository.markPaid(runId, digest), true),
    markFailed: (runId, abortCode, digest) =>
      attempt((repository) => repository.markFailed(runId, abortCode, digest), true),
    listRecent: (limit) => attempt((repository) => repository.listRecent(limit), false),
    persisted: () => proven && !latched && !usedBackup,
    reason: () => (latched || usedBackup ? missing : null),
  };
}
