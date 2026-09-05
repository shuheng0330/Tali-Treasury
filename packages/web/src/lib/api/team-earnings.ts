import type {
  Address,
  ObjectId,
  PayrollConfigurationView,
  SalaryStreamRegistrationResponse,
  SalaryStreamView,
} from '@tali/shared';

/** One person the employer pays, and whatever is known about their salary. */
export interface TeamMemberEarnings {
  mandateId: ObjectId;
  employee: Address;
  /**
   * Why there is or is not a figure, kept apart from the figure itself.
   *
   * An employer reading a blank row has to be able to tell a stream that has
   * not been opened from one the chain would not answer for. The first is their
   * own next step; the second is an outage, and telling them apart wrongly
   * would have somebody open a second stream against a mandate that already has
   * one.
   */
  state: 'live' | 'unopened' | 'unreadable';
  stream: SalaryStreamView | null;
}

/**
 * The team's salaries, assembled from the two routes that already guard them.
 *
 * Deliberately not a new endpoint. Reading a stream means authorising the
 * caller against the mandate, checking the stream belongs to it and to the
 * employee it names, and knowing whether chain reads are live at all —
 * `/api/payroll/streams` and `/api/streams/[id]` do all three today, and a
 * fourth copy of that reasoning is three more places for it to drift. The cost
 * is two requests per person, which for a payroll of this size is nothing.
 *
 * Only payrolls this wallet employs are read. The list route already scopes
 * itself to the caller, so this filter is belt and braces: a wallet that is an
 * employer here and an employee somewhere else must not find their own salary
 * in the team list.
 */
export async function loadTeamEarnings(
  configurations: readonly PayrollConfigurationView[],
  fetcher: typeof fetch = fetch,
): Promise<TeamMemberEarnings[]> {
  const employed = configurations.filter((configuration) => configuration.role === 'employer');

  return Promise.all(employed.map((configuration) => member(configuration, fetcher)));
}

async function member(
  configuration: PayrollConfigurationView,
  fetcher: typeof fetch,
): Promise<TeamMemberEarnings> {
  const base = {
    mandateId: configuration.mandateId,
    employee: configuration.employee,
  };
  const payroll = encodeURIComponent(configuration.mandateId);

  try {
    const registration = await fetcher(`/api/payroll/streams?payroll=${payroll}`, {
      cache: 'no-store',
    });
    if (!registration.ok) return { ...base, state: 'unreadable', stream: null };

    const { stream } = (await registration.json()) as SalaryStreamRegistrationResponse;
    if (!stream) return { ...base, state: 'unopened', stream: null };

    const live = await fetcher(
      `/api/streams/${encodeURIComponent(stream.streamId)}?payroll=${payroll}`,
      { cache: 'no-store' },
    );
    if (!live.ok) return { ...base, state: 'unreadable', stream: null };

    return { ...base, state: 'live', stream: (await live.json()) as SalaryStreamView };
  } catch {
    /* One unreachable row must not take the rest of the team down with it. */
    return { ...base, state: 'unreadable', stream: null };
  }
}

/** What the whole team has earned so far, at one instant. */
export function teamAccruedAt(
  members: readonly TeamMemberEarnings[],
  accrued: (stream: SalaryStreamView) => string,
): string {
  return members
    .reduce((total, entry) => (entry.stream ? total + BigInt(accrued(entry.stream)) : total), 0n)
    .toString();
}
