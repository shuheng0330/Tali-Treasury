'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LeaveRequest,
  OvertimeClaim,
  PayrollBreakdown,
  StatutorySplit,
} from '@tali/shared';
import { toDisplay } from '@tali/shared';

import { DataNotice } from '../DataNotice';
import { RoleNotice } from '../RoleNotice';
import { useWalletSession } from '../wallet/WalletSessionProvider';
import { tryPreviewPayroll } from '../../lib/api/payroll';
import { EMPLOYER_WALLET } from '../../lib/demo-config';
import { walletAccess, type AccessCopy } from '../../lib/wallet-access';
import {
  basisAfter,
  commitment,
  composeSplit,
  epfBase,
  grossOf,
  itemEmployee,
  itemId,
  queueOrder,
  wageBasis,
  type ApprovalItem,
  type MandateBudget,
  type ReviewAction,
} from '../../lib/approval-summary';
import { ApprovalDialog } from './ApprovalDialog';
import { ApprovalRow } from './ApprovalRow';
import type { Projection } from './CommitmentSummary';

/**
 * Named apart from running payroll for the reason setting payroll up is: a
 * notice telling this reader they cannot "run payroll" would describe an act
 * this screen does not perform.
 */
const DECIDE_COPY: AccessCopy = {
  action: 'decide overtime and leave',
  holder: 'the employer wallet',
};

/**
 * The class of worker this mandate's floors were written for, and the only one
 * `run` accepts. Within it the EPF rates do not vary with age, so any age under
 * 60 produces the same split.
 */
const MANDATE_CLASS = { age: 30, citizenship: 'local' as const };

/** Long enough to survive opening a dialog twice, short enough not to hold a stale rate. */
const QUOTE_LIFETIME_MS = 60_000;

type Tab = 'overtime' | 'leave';

interface Quote {
  split: StatutorySplit | null;
  myrPerUsd: string | null;
  reason: string | null;
}

interface OvertimeListBody {
  claims: OvertimeClaim[];
  persisted: boolean;
  reason: string | null;
}

interface LeaveListBody {
  requests: LeaveRequest[];
  persisted: boolean;
  reason: string | null;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `The request failed (${response.status}).`;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && 'message' in body) {
        message = String((body as { message: unknown }).message);
      }
    } catch {
      /* The status code is the whole of what the server said. */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function toQuote(result: {
  data: PayrollBreakdown | null;
  reason: string | null;
}): Quote {
  const split = result.data?.fxConversion?.source ?? null;
  return {
    split,
    myrPerUsd: result.data?.fxConversion?.myrPerUsd ?? null,
    reason: split ? null : (result.reason ?? 'the statutory split could not be computed'),
  };
}

function isWaiting(item: ApprovalItem): boolean {
  return (item.kind === 'overtime' ? item.claim.status : item.request.status) === 'submitted';
}

function itemLabel(item: ApprovalItem): string {
  return item.kind === 'overtime'
    ? `the overtime for ${item.claim.workedOn}`
    : `the leave from ${item.request.startOn}`;
}

interface Props {
  mandate: MandateBudget | null;
  /** Why the mandate could not be read, when it could not be. */
  mandateError: string | null;
}

export function ApprovalQueue({ mandate, mandateError }: Props) {
  const wallet = useWalletSession();
  const access = walletAccess(wallet.address, EMPLOYER_WALLET, DECIDE_COPY);
  const authenticated = wallet.status === 'authenticated';

  const [claims, setClaims] = useState<OvertimeClaim[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [storage, setStorage] = useState<{ persisted: boolean; reason: string | null }>({
    persisted: true,
    reason: null,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overtime');
  const [reviewing, setReviewing] = useState<{
    id: string;
    kind: Tab;
    action: ReviewAction;
  } | null>(null);
  const [projection, setProjection] = useState<Projection>({ status: 'loading' });
  const [pending, setPending] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const quotes = useRef(new Map<string, { at: number; quote: Promise<Quote> }>());
  const mandateId = mandate?.mandateId ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overtime, leave] = await Promise.all([
        fetch('/api/overtime', { cache: 'no-store' }).then(readJson<OvertimeListBody>),
        fetch('/api/leave', { cache: 'no-store' }).then(readJson<LeaveListBody>),
      ]);
      setClaims(overtime.claims);
      setRequests(leave.requests);
      setStorage({
        persisted: overtime.persisted && leave.persisted,
        reason: overtime.reason ?? leave.reason,
      });
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'The queue could not be read. Nothing was decided.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const quoteFor = useCallback(
    (gross: string): Promise<Quote> => {
      if (!mandateId) {
        return Promise.resolve({
          split: null,
          myrPerUsd: null,
          reason: 'no payroll mandate could be read',
        });
      }
      if (BigInt(gross) <= 0n) {
        return Promise.resolve({
          split: null,
          myrPerUsd: null,
          reason: 'the wage of record for this employee is not known',
        });
      }

      const now = Date.now();
      const cached = quotes.current.get(gross);
      if (cached && now - cached.at < QUOTE_LIFETIME_MS) return cached.quote;

      const quote = tryPreviewPayroll({ mandateId, gross, ...MANDATE_CLASS }).then(toQuote);
      quotes.current.set(gross, { at: now, quote });
      return quote;
    },
    [mandateId],
  );

  const items = useMemo<ApprovalItem[]>(
    () => [
      ...claims.map((claim): ApprovalItem => ({ kind: 'overtime', claim })),
      ...requests.map((request): ApprovalItem => ({ kind: 'leave', request })),
    ],
    [claims, requests],
  );

  const reviewingItem = useMemo(
    () => (reviewing ? (items.find((item) => itemId(item) === reviewing.id) ?? null) : null),
    [items, reviewing],
  );

  useEffect(() => {
    if (!reviewing || reviewing.action !== 'approve' || !reviewingItem) return;

    if (!mandate) {
      setProjection({
        status: 'unavailable',
        reason: mandateError
          ? `The payroll mandate could not be read from Sui: ${mandateError}.`
          : 'No payroll mandate is configured on this deployment.',
      });
      return;
    }

    let current = true;
    setProjection({ status: 'loading' });

    const basis = wageBasis(itemEmployee(reviewingItem), claims, requests);
    const next = basisAfter(basis, reviewingItem);

    void Promise.all([
      quoteFor(epfBase(basis)),
      quoteFor(grossOf(basis)),
      quoteFor(epfBase(next)),
      quoteFor(grossOf(next)),
    ]).then(([epfNow, wageNow, epfNext, wageNext]) => {
      if (!current) return;

      const failed = [epfNow, wageNow, epfNext, wageNext].find((quote) => !quote.split);
      if (failed) {
        setProjection({
          status: 'unavailable',
          reason: `The statutory split could not be computed: ${failed.reason}.`,
        });
        return;
      }

      const before = composeSplit(epfNow.split!, wageNow.split!);
      const after = composeSplit(epfNext.split!, wageNext.split!);
      if (!before || !after) {
        setProjection({
          status: 'unavailable',
          reason: 'The two halves of the statutory split did not line up.',
        });
        return;
      }

      setProjection({
        status: 'ready',
        commitment: commitment({
          before,
          after,
          mandate,
          myrPerUsd: wageNext.myrPerUsd,
        }),
      });
    });

    return () => {
      current = false;
    };
  }, [claims, mandate, mandateError, quoteFor, requests, reviewing, reviewingItem]);

  function openReview(item: ApprovalItem, action: ReviewAction) {
    setReviewError(null);
    setOutcome(null);
    setProjection({ status: 'loading' });
    setReviewing({ id: itemId(item), kind: item.kind, action });
  }

  async function submit(reason?: string) {
    if (!reviewing || !reviewingItem) return;

    setPending(true);
    setReviewError(null);
    const path =
      reviewing.kind === 'overtime'
        ? `/api/overtime/${encodeURIComponent(reviewing.id)}/review`
        : `/api/leave/${encodeURIComponent(reviewing.id)}/review`;

    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: reviewing.action,
          ...(reason ? { reason } : {}),
        }),
      });

      /* The server's own copy of the record, which is the only thing that says
         what was actually written. Nothing on this screen moves before it
         arrives. */
      const recorded =
        reviewing.kind === 'overtime'
          ? (await readJson<{ claim: OvertimeClaim }>(response)).claim
          : (await readJson<{ request: LeaveRequest }>(response)).request;

      const asked = reviewing.action === 'approve' ? 'approved' : 'rejected';
      setOutcome(
        recorded.status === asked
          ? `Recorded: ${itemLabel(reviewingItem)} is ${recorded.status}.`
          : `The server recorded ${itemLabel(reviewingItem)} as ${recorded.status}, not ${asked}.`,
      );
      setReviewing(null);
      await load();
    } catch (error) {
      setReviewError(
        error instanceof Error ? error.message : 'The decision could not be recorded.',
      );
    } finally {
      setPending(false);
    }
  }

  const shown = items.filter((item) => item.kind === tab);
  const waiting = queueOrder(shown.filter(isWaiting));
  const decided = shown
    .filter((item) => !isWaiting(item))
    .sort(
      (a, b) =>
        (b.kind === 'overtime' ? b.claim.createdAtMs : b.request.createdAtMs) -
        (a.kind === 'overtime' ? a.claim.createdAtMs : a.request.createdAtMs),
    )
    .slice(0, 5);

  const counts = {
    overtime: items.filter((item) => item.kind === 'overtime' && isWaiting(item)).length,
    leave: items.filter((item) => item.kind === 'leave' && isWaiting(item)).length,
  };

  const blocked = !authenticated || !access.permitted;
  const blockedReason = access.notice ?? 'Sign in with the employer wallet first';

  /* Measured against the read rather than against now, so the server and the
     browser cannot disagree about whether the mandate had already expired. */
  const standing = !mandate
    ? null
    : mandate.revoked
      ? 'revoked'
      : mandate.expiryMs <= mandate.fetchedAtMs
        ? 'expired'
        : 'active';

  return (
    <div className="flex flex-col gap-5">
      {mandate && standing ? (
        <div
          className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-card border px-4 py-3 ${
            standing === 'active'
              ? 'border-ok-line bg-ok-soft'
              : standing === 'revoked'
                ? 'border-dashed border-dead-line bg-dead-soft'
                : 'border-dead-line bg-dead-soft'
          }`}
        >
          <div>
            <p
              className={`text-body font-medium ${
                standing === 'active' ? 'text-ok' : 'text-dead'
              }`}
            >
              {standing === 'active'
                ? 'Live from Sui Testnet'
                : standing === 'revoked'
                  ? 'This mandate has been revoked'
                  : 'This mandate has expired'}
            </p>
            {/* The server renders this in its own timezone and the browser in
                the reader's, so the two legitimately differ. */}
            <p className="text-caption text-ink-2" suppressHydrationWarning>
              Read at {new Date(mandate.fetchedAtMs).toLocaleTimeString('en-GB')} ·{' '}
              {standing === 'active'
                ? `${toDisplay(mandate.spendable, 6)} USDC spendable, and no way to add more`
                : 'Nothing can be paid from it, whatever is approved here'}
            </p>
          </div>
          <p className="tnum text-caption text-ink-2">
            EPF floor{' '}
            {mandate.floors.find((floor) => floor.body === 'epf')?.minBps ?? '—'} bps ·
            run limit {toDisplay(mandate.maxPerRun, 6)} USDC
          </p>
        </div>
      ) : (
        <p className="rounded-card border border-wait-line bg-wait-soft p-4 text-caption text-wait">
          <span className="font-medium">The payroll mandate could not be read.</span>{' '}
          <span className="text-ink-2">
            {mandateError ?? 'No payroll mandate is configured on this deployment.'} You
            can still record decisions; what they would commit on chain is not shown
            rather than guessed at.
          </span>
        </p>
      )}

      <section className="flex flex-col overflow-hidden rounded-panel border border-rule bg-surface">
        <div className="flex flex-col gap-3 border-b border-rule p-4 empty:hidden">
          {!storage.persisted ? (
            <DataNotice
              source="mock"
              reason={storage.reason}
              live="These decisions"
              simulated="Approved overtime joins the next payroll run."
              plural
              fallbackLabel="Not saved yet."
              fallbackNote="Your decisions still work. They will be lost if the app restarts, so approve again after that."
            />
          ) : null}
          {loadError ? (
            <p
              className="rounded-control border border-no-line bg-no-soft p-3 text-caption text-no"
              role="alert"
            >
              {loadError}
            </p>
          ) : null}
          {outcome ? (
            <p
              className="rounded-control border border-rule bg-raised p-3 text-caption text-ink-2"
              role="status"
            >
              {outcome}
            </p>
          ) : null}
          <RoleNotice access={access} />
        </div>

        <div className="flex flex-wrap items-center gap-1 border-b border-rule px-3 py-2">
          {(['overtime', 'leave'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setTab(entry)}
              aria-pressed={tab === entry}
              className={`rounded-badge px-4 py-2 font-display text-label uppercase transition-colors duration-150 ${
                tab === entry ? 'bg-ink text-canvas' : 'text-ink-3 hover:bg-raised hover:text-ink'
              }`}
            >
              {entry === 'overtime' ? 'Overtime' : 'Leave'}
              <span className="tnum ml-2 opacity-60">{counts[entry]}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="btn btn--ghost ml-auto h-9 px-4 text-label"
          >
            {loading ? 'Reading…' : 'Refresh'}
          </button>
        </div>

        {loading && items.length === 0 ? (
          <p className="px-6 py-10 text-center text-caption text-ink-3">
            Reading what is waiting on you…
          </p>
        ) : waiting.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="text-heading text-ok" aria-hidden>
              ✓
            </span>
            <p className="text-subhead">Nothing needs you</p>
            <p className="max-w-sm text-caption text-ink-3">
              {tab === 'overtime'
                ? 'No overtime claim is waiting on a decision.'
                : 'No leave request is waiting on a decision.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-rule">
            {waiting.map((item) => (
              <ApprovalRow
                key={itemId(item)}
                item={item}
                onReview={openReview}
                pendingAction={
                  reviewing?.id === itemId(item) && pending ? reviewing.action : null
                }
                busy={pending}
                disabled={blocked}
                disabledReason={blockedReason}
              />
            ))}
          </ul>
        )}

        {decided.length > 0 ? (
          <>
            <div className="border-t border-rule px-4 py-2">
              <span className="eyebrow">Already decided</span>
            </div>
            <ul className="flex flex-col divide-y divide-rule border-t border-rule">
              {decided.map((item) => (
                <ApprovalRow
                  key={itemId(item)}
                  item={item}
                  onReview={openReview}
                  pendingAction={null}
                  busy={pending}
                  disabled
                />
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {reviewing && reviewingItem ? (
        <ApprovalDialog
          item={reviewingItem}
          action={reviewing.action}
          projection={projection}
          pending={pending}
          serverError={reviewError}
          onCancel={() => {
            if (!pending) setReviewing(null);
          }}
          onConfirm={submit}
        />
      ) : null}
    </div>
  );
}
