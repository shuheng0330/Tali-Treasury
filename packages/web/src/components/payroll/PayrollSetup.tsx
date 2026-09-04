'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDAppKit } from '@mysten/dapp-kit-react';
import type { PayrollBreakdown } from '@tali/shared';
import {
  EXPLORER,
  STATUTORY_BODIES,
  STATUTORY_BODY_LABEL,
  toDisplay,
  type StatutoryBody,
} from '@tali/shared';
import {
  buildCreatePayrollMandateTransaction,
  CIRCLE_TESTNET_USDC_TYPE,
  SUI_CLOCK_ID,
} from '@tali/treasury-sui';

import { DataNotice } from '@/components/DataNotice';
import { Breakdown } from './Breakdown';
import { WageClass } from './WageClass';
import { tryPreviewPayroll } from '@/lib/api/payroll';
import { tryRegisterPayroll } from '@/lib/api/payroll-registration';
import { AGENT_ADDRESS, PAYROLL_PACKAGE_ID } from '@/lib/demo-config';
import { grossProblem, grossToBaseUnits, type WageClassValue } from '@/lib/payroll-wage';
import {
  capProblem,
  coverageProblem,
  mandateAmounts,
  NET_MIN_BPS,
  setupProblems,
  type SetupFormValue,
} from '@/lib/payroll-setup';
import { useWalletSession } from '@/components/wallet/WalletSessionProvider';

/**
 * What happened to the funding transaction.
 *
 * `funded` is deliberately distinct from `registered`. Once the chain has taken
 * the money the flow can never start over, so every later failure has to keep
 * the digest and offer the registration retry rather than the button that signs.
 */
type Outcome =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'refused'; message: string }
  | { kind: 'aborted'; digest: string }
  | { kind: 'funded'; digest: string; registering: boolean; reason: string | null }
  | { kind: 'registered'; digest: string; mandateId: string };

interface Props {
  defaultEmployee: string;
}

function Field({
  label,
  hint,
  problem,
  children,
}: {
  label: string;
  hint?: string;
  problem?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 rounded-control border border-rule bg-surface px-3 py-2">
        <span className="text-caption text-ink-2">{label}</span>
        {children}
      </label>
      {problem ? (
        <p className="text-caption text-no" role="alert">
          {problem}
        </p>
      ) : hint ? (
        <p className="text-caption text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

const INPUT = 'bg-transparent text-body outline-none disabled:opacity-60';
const ADDRESS_INPUT = `${INPUT} font-mono text-caption`;

/**
 * A blank field nobody has typed in yet is incomplete, not wrong.
 *
 * The disabled button already says the details need finishing, and opening the
 * screen with three red lines under three empty boxes reads as though something
 * has failed.
 */
function ifFilled(problem: string | undefined, raw: string): string | undefined {
  return raw.trim() === '' ? undefined : problem;
}

export function PayrollSetup({ defaultEmployee }: Props) {
  const dapp = useDAppKit();
  const { address, connectedAddress, status } = useWalletSession();

  const [wage, setWage] = useState<WageClassValue>({
    gross: '30.00',
    age: 30,
    citizenship: 'local',
  });
  const [form, setForm] = useState<SetupFormValue>({
    employee: defaultEmployee,
    capRecipient: AGENT_ADDRESS,
    fundingMyr: '50.00',
    maxPerRunMyr: '40.00',
    expiryDays: '30',
    recipients: { epf: '', socso: '', eis: '' },
  });

  const [breakdown, setBreakdown] = useState<PayrollBreakdown | null>(null);
  const [previewReason, setPreviewReason] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [approvedRate, setApprovedRate] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  const problems = useMemo(() => setupProblems(form), [form]);
  const wageInvalid =
    grossProblem(wage.gross) !== null || wage.age < 16 || wage.age > 100;
  const base = grossToBaseUnits(wage.gross);

  useEffect(() => {
    if (wageInvalid || base === null || problems.employee) {
      setBreakdown(null);
      return;
    }

    let active = true;
    setPreviewing(true);
    const timer = window.setTimeout(() => {
      /* No sample fallback here, unlike the payroll desk. A stored split for a
         different wage would end up underneath a budget somebody is about to
         fund, and the amounts on this screen decide how much money moves. */
      void tryPreviewPayroll({
        employee: form.employee.trim(),
        gross: base.toString(),
        age: wage.age,
        citizenship: wage.citizenship,
      }).then((result) => {
        if (!active) return;
        setBreakdown(result.data);
        setPreviewReason(result.reason);
        setPreviewing(false);
      });
    }, 400);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [base, form.employee, problems.employee, wage.age, wage.citizenship, wageInvalid]);

  const quote = breakdown?.fxConversion ?? null;

  /* An approval is for one rate. A refreshed quote is a different set of
     amounts, so the tick has to go back rather than carry over silently. */
  useEffect(() => {
    if (approvedRate !== null && quote?.myrPerUsd !== approvedRate) {
      setApprovedRate(null);
    }
  }, [approvedRate, quote?.myrPerUsd]);

  const amounts = useMemo(() => {
    if (!quote || Object.keys(problems).length > 0) return null;
    try {
      return mandateAmounts(form, quote.myrPerUsd);
    } catch {
      return null;
    }
  }, [form, problems, quote]);

  const employerCost = breakdown ? BigInt(breakdown.employerCost) : 0n;
  const coverage = amounts ? coverageProblem(amounts.budget, employerCost) : null;
  const cap = amounts ? capProblem(amounts.maxPerRun, employerCost) : null;

  /* Named on the closed summary so a required field is never merely hidden. */
  const outstanding = STATUTORY_BODIES.filter((body) => !form.recipients[body].trim()).length;

  const authenticated = status === 'authenticated' && address !== null;
  const sameAccount = address !== null && address === connectedAddress;

  const blocker = !PAYROLL_PACKAGE_ID
    ? 'The payroll module is not published yet, so there is nothing to create a mandate in.'
    : !authenticated
      ? 'Sign in with the employer wallet first.'
      : !sameAccount
        ? 'The connected wallet is not the one this session was signed with.'
        : Object.keys(problems).length > 0 || wageInvalid
          ? 'Some of the details above still need fixing.'
          : !quote || !amounts
            ? 'A live rate is needed before any ringgit figure can become a USDC amount.'
            : (coverage ?? cap ?? (approvedRate === null ? 'Approve the rate and amounts.' : null));

  async function sign() {
    if (!amounts || !address || blocker) return;
    setOutcome({ kind: 'signing' });

    let digest: string;
    try {
      const transaction = buildCreatePayrollMandateTransaction(
        {
          packageId: PAYROLL_PACKAGE_ID,
          coinType: CIRCLE_TESTNET_USDC_TYPE,
          clockId: SUI_CLOCK_ID,
        },
        {
          sender: address,
          approvedEmployees: [form.employee.trim()],
          capRecipient: form.capRecipient.trim(),
          budget: amounts.budget,
          floors: amounts.floors,
          netMinBps: amounts.netMinBps,
          maxPerRun: amounts.maxPerRun,
          expiryMs: amounts.expiryMs,
        },
      );

      const result = await dapp.signAndExecuteTransaction({ transaction, network: 'testnet' });

      /* A rejected contract call resolves here rather than throwing, so the
         success path has to be chosen explicitly. Reporting a funded mandate
         off an unchecked result is the one mistake this screen cannot make. */
      if (result.$kind === 'FailedTransaction') {
        setOutcome({ kind: 'aborted', digest: result.FailedTransaction.digest });
        return;
      }
      digest = result.Transaction.digest;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The wallet did not sign.';
      setOutcome({ kind: 'refused', message });
      return;
    }

    setOutcome({ kind: 'funded', digest, registering: true, reason: null });
    await register(digest);
  }

  async function register(digest: string) {
    setOutcome({ kind: 'funded', digest, registering: true, reason: null });
    const result = await tryRegisterPayroll(digest);
    if (result.kind === 'registered') {
      setOutcome({ kind: 'registered', digest, mandateId: result.mandateId });
      return;
    }
    setOutcome({
      kind: 'funded',
      digest,
      registering: false,
      reason: result.kind === 'refused' ? result.message : result.reason,
    });
  }

  const funded = outcome.kind === 'funded' || outcome.kind === 'registered';

  return (
    <div className="flex flex-col gap-6">
      <DataNotice
        source={breakdown ? 'live' : 'mock'}
        reason={previewReason}
        live="The statutory split and the MYR to USDC rate"
        plural
        fallbackLabel="No quote."
        simulated="Nothing is signed until a live rate has been approved, so the amounts below cannot be funded from stale arithmetic."
      />

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">Who is being paid</h2>
        <Field label="Employee wallet" problem={ifFilled(problems.employee, form.employee)}>
          <input
            value={form.employee}
            disabled={funded}
            spellCheck={false}
            onChange={(event) => setForm({ ...form, employee: event.target.value })}
            className={ADDRESS_INPUT}
          />
        </Field>
        <p className="text-caption text-ink-3">
          The only address this mandate will ever pay a wage to. It is fixed at creation.
        </p>
        <WageClass value={wage} onChange={setWage} disabled={funded} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">What one run costs</h2>
        {previewing ? (
          <p className="rounded-card border border-dashed border-rule px-4 py-8 text-center text-caption text-ink-3">
            Working out the split…
          </p>
        ) : breakdown ? (
          <Breakdown breakdown={breakdown} />
        ) : (
          <p className="rounded-card border border-dashed border-rule px-4 py-8 text-center text-caption text-ink-3">
            No split to show yet.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">What the mandate may spend</h2>
        <Field
          label="Fund the mandate with (RM)"
          problem={ifFilled(problems.fundingMyr, form.fundingMyr) ?? coverage ?? undefined}
          hint="Converted to USDC at the approved rate and locked in the mandate."
        >
          <input
            value={form.fundingMyr}
            inputMode="decimal"
            disabled={funded}
            onChange={(event) => setForm({ ...form, fundingMyr: event.target.value })}
            className={`${INPUT} tnum text-title`}
          />
        </Field>
        <Field
          label="Most one run may spend (RM)"
          problem={ifFilled(problems.maxPerRunMyr, form.maxPerRunMyr) ?? cap ?? undefined}
          hint="A ceiling the contract enforces on every run, wage and contributions together."
        >
          <input
            value={form.maxPerRunMyr}
            inputMode="decimal"
            disabled={funded}
            onChange={(event) => setForm({ ...form, maxPerRunMyr: event.target.value })}
            className={`${INPUT} tnum`}
          />
        </Field>
      </section>

      <details className="group rounded-card border border-rule bg-surface p-4">
        <summary className="flex cursor-pointer items-center gap-3 rounded-control text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">
          <span className="min-w-0 flex-1">Contributions, expiry and who may run it</span>
          <span className={`shrink-0 text-caption ${outstanding > 0 ? 'text-wait' : 'text-ink-3'}`}>
            {outstanding > 0
              ? `${outstanding} address${outstanding === 1 ? '' : 'es'} still needed`
              : 'All set'}
          </span>
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="shrink-0 text-ink-3 transition-transform duration-150 group-open:rotate-180"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>

        <div className="mt-4 flex flex-col gap-3">
          <p className="text-caption text-ink-3">
            Testnet stand-ins for the real bodies. Each address is paired with its floor by
            position, so they cannot be reordered or shared afterwards.
          </p>
          {STATUTORY_BODIES.map((body: StatutoryBody) => (
            <Field
              key={body}
              label={`${STATUTORY_BODY_LABEL[body]} recipient`}
              problem={ifFilled(problems[body], form.recipients[body])}
            >
              <input
                value={form.recipients[body]}
                disabled={funded}
                spellCheck={false}
                placeholder="0x…"
                onChange={(event) =>
                  setForm({
                    ...form,
                    recipients: { ...form.recipients, [body]: event.target.value },
                  })
                }
                className={ADDRESS_INPUT}
              />
            </Field>
          ))}

          <Field
            label="Expires in (days)"
            problem={ifFilled(problems.expiryDays, form.expiryDays)}
            hint="After this the mandate stops paying, whatever is left in it."
          >
            <input
              value={form.expiryDays}
              inputMode="numeric"
              disabled={funded}
              onChange={(event) => setForm({ ...form, expiryDays: event.target.value })}
              className={`${INPUT} tnum`}
            />
          </Field>

          <Field
            label="PayrollCap recipient"
            problem={ifFilled(problems.capRecipient, form.capRecipient)}
            hint="Whoever holds it can both run this payroll and revoke it. It defaults to the backend signer, because the server sends the runs."
          >
            <input
              value={form.capRecipient}
              disabled={funded}
              spellCheck={false}
              onChange={(event) => setForm({ ...form, capRecipient: event.target.value })}
              className={ADDRESS_INPUT}
            />
          </Field>
        </div>
      </details>

      {quote && amounts ? (
        <section className="flex flex-col gap-3 rounded-card border border-rule bg-surface p-4">
          <h2 className="eyebrow">Approve the rate</h2>
          <dl className="flex flex-col gap-2 text-body">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">Rate</dt>
              <dd className="tnum">1 USD = {quote.myrPerUsd} MYR</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">Budget</dt>
              <dd className="tnum">{toDisplay(amounts.budget.toString(), 6)} USDC</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">Cap per run</dt>
              <dd className="tnum">{toDisplay(amounts.maxPerRun.toString(), 6)} USDC</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">Worker keeps at least</dt>
              <dd className="tnum">{Number(NET_MIN_BPS) / 100}% of gross</dd>
            </div>
          </dl>
          <label className="flex items-start gap-2 text-caption text-ink-2">
            <input
              type="checkbox"
              checked={approvedRate !== null}
              disabled={funded}
              onChange={(event) =>
                setApprovedRate(event.target.checked ? quote.myrPerUsd : null)
              }
              className="mt-0.5"
            />
            <span>
              I approve this rate and these exact USDC amounts. A newer quote will ask again.
            </span>
          </label>
        </section>
      ) : null}

      {outcome.kind === 'registered' ? (
        <section className="flex flex-col gap-2 rounded-card border border-ok-line bg-ok-soft p-4">
          <p className="text-body font-medium text-ok">Payroll is set up.</p>
          <p className="text-caption text-ink-2">
            Mandate <span className="font-mono">{outcome.mandateId}</span> is funded and
            registered.
          </p>
          <a
            className="link self-start text-caption"
            href={EXPLORER.tx(outcome.digest).suiscan}
            target="_blank"
            rel="noreferrer"
          >
            View the funding transaction
          </a>
        </section>
      ) : outcome.kind === 'funded' ? (
        <section className="flex flex-col gap-3 rounded-card border border-wait-line bg-wait-soft p-4">
          <p className="text-body font-medium text-wait">
            {outcome.registering
              ? 'Funded on chain. Registering it…'
              : 'Funded on chain, but not registered.'}
          </p>
          <p className="text-caption text-ink-2">
            {outcome.registering
              ? 'The money has moved. Leave this open.'
              : `The mandate exists and holds your USDC${
                  outcome.reason ? `, but ${outcome.reason}` : ''
                }. Retry the registration — do not set up payroll again, which would fund a second mandate.`}
          </p>
          <a
            className="link self-start text-caption"
            href={EXPLORER.tx(outcome.digest).suiscan}
            target="_blank"
            rel="noreferrer"
          >
            View the funding transaction
          </a>
          {outcome.registering ? null : (
            <button
              type="button"
              onClick={() => void register(outcome.digest)}
              className="btn btn--primary h-9 w-fit px-5 text-label"
            >
              Retry registration
            </button>
          )}
        </section>
      ) : outcome.kind === 'aborted' ? (
        <section className="flex flex-col gap-2 rounded-card border border-no-line bg-no-soft p-4">
          <p className="text-body font-medium text-no">The contract refused it.</p>
          <p className="text-caption text-ink-2">
            Nothing was funded and no mandate exists. Gas was still spent.
          </p>
          <a
            className="link self-start text-caption"
            href={EXPLORER.tx(outcome.digest).suiscan}
            target="_blank"
            rel="noreferrer"
          >
            View the refused transaction
          </a>
        </section>
      ) : outcome.kind === 'refused' ? (
        <p className="rounded-card border border-no-line bg-no-soft p-4 text-caption text-no" role="alert">
          {outcome.message} Nothing was funded.
        </p>
      ) : null}

      {funded ? null : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void sign()}
            disabled={blocker !== null || outcome.kind === 'signing'}
            className="btn btn--primary btn--block h-12 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {outcome.kind === 'signing' ? 'Waiting for your wallet…' : 'Sign and fund payroll'}
          </button>
          {blocker ? <p className="text-caption text-ink-3">{blocker}</p> : null}
        </div>
      )}
    </div>
  );
}
