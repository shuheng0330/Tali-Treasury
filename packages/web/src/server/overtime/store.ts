import type { OvertimeRepository } from './ports';
import { OvertimeTablesMissingError } from '../supabase/overtime-repository';

/**
 * A repository that reports whether what it just did will survive a restart.
 *
 * Overtime is somebody's money and leave is somebody's time off. A list of
 * either that quietly empties on the next deploy, presented as a record, is
 * the kind of thing this codebase is supposed to refuse to do.
 */
export interface OvertimeStore extends OvertimeRepository {
  persisted(): boolean;
  reason(): string | null;
}

export function memoryOnlyStore(
  backup: OvertimeRepository,
  reason: string,
): OvertimeStore {
  return { ...backup, persisted: () => false, reason: () => reason };
}

/**
 * Uses the database, and falls back to memory only for the one thing that can
 * legitimately be missing before the migration is applied.
 *
 * Once a claim has been written to memory the store stays there: the review
 * that follows has to find it. Before that point every call retries the
 * database, so applying the migration takes effect without a restart.
 */
export function fallbackStore(
  primary: OvertimeRepository,
  backup: OvertimeRepository,
): OvertimeStore {
  const missing = 'the overtime_claims and leave_requests tables have not been created yet';
  let latched = false;
  let usedBackup = false;
  /* Nothing has been demonstrated until something has actually been asked of
     the database. Reporting persistence before the first call would make the
     banner depend on the order the page happens to call things in. */
  let proven = false;

  async function attempt<T>(
    action: (repository: OvertimeRepository) => Promise<T>,
    latchOnFallback: boolean,
  ): Promise<T> {
    if (latched) return action(backup);

    try {
      const result = await action(primary);
      usedBackup = false;
      proven = true;
      return result;
    } catch (error) {
      if (!(error instanceof OvertimeTablesMissingError)) throw error;
      usedBackup = true;
      if (latchOnFallback) latched = true;
      return action(backup);
    }
  }

  return {
    createClaim: (input) => attempt((repository) => repository.createClaim(input), true),
    listClaims: (limit) => attempt((repository) => repository.listClaims(limit), false),
    findClaim: (id) => attempt((repository) => repository.findClaim(id), false),
    decideClaim: (decision) => attempt((repository) => repository.decideClaim(decision), true),
    settleClaims: (input) => attempt((repository) => repository.settleClaims(input), true),
    createLeave: (input) => attempt((repository) => repository.createLeave(input), true),
    listLeave: (limit) => attempt((repository) => repository.listLeave(limit), false),
    findLeave: (id) => attempt((repository) => repository.findLeave(id), false),
    decideLeave: (decision) => attempt((repository) => repository.decideLeave(decision), true),
    persisted: () => proven && !latched && !usedBackup,
    reason: () => (latched || usedBackup ? missing : null),
  };
}
