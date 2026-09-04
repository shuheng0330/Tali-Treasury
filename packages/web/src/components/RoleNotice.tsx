import type { Access } from '@/lib/wallet-access';

/**
 * Says who an action belongs to, when the reader is not them.
 *
 * Graphite when the screen simply cannot check yet, amber when it can and the
 * answer is no. Neither is an error: nothing has gone wrong, the control just
 * is not this reader's to press.
 */
export function RoleNotice({ access }: { access: Access }) {
  if (!access.notice) return null;

  return (
    <p
      className={`rounded-card border p-4 text-caption ${
        access.permitted
          ? 'border-rule bg-raised text-ink-2'
          : 'border-wait-line bg-wait-soft text-wait'
      }`}
    >
      {access.notice}
    </p>
  );
}
