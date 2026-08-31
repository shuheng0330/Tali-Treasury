# Backend-Agent Payment Design

## Goal

Extend `POST /api/claims/:id/process` so an `auto_pay` claim can be paid by the
server-held Sui testnet agent after policy evaluation. The flow must prevent two
requests from signing the same claim, fail closed when submission status is
uncertain, and never expose or commit agent credentials.

This increment implements and verifies the code with fake clients and signers. It
does not broadcast a real transaction.

## Scope

The increment includes:

- automatic payment inside the existing claim-processing endpoint;
- lazy server-only agent configuration;
- construction of the existing `buildSpendTransaction` transaction;
- testnet signing, submission and finality handling behind an injected adapter;
- atomic payment reservation and terminal payment persistence;
- idempotent responses for already completed claims;
- safe handling of known rejection versus uncertain submission;
- sanitized API errors and persisted payment messages; and
- unit, repository, route, type-check, build and dependency-audit coverage.

The increment excludes:

- broadcasting a real testnet transaction during automated verification;
- mainnet configuration or mainnet payment support;
- automatic retries after an uncertain submission;
- a persistent transaction outbox or background reconciler;
- treasurer review actions;
- wallet-signature authentication; and
- frontend removal of the remaining mock payment presentation.

## Safety priorities

The order of priorities is:

1. never pay a claim twice;
2. never expose the private key, signed bytes or raw provider errors;
3. never sign a claim that did not receive an `auto_pay` decision;
4. preserve an auditable terminal result for confirmed success or failure; and
5. prefer a claim that requires reconciliation over an unsafe automatic retry.

An uncertain submission therefore remains in `paying`. A repeated request must
not sign again.

## Endpoint behavior

`POST /api/claims/:id/process` remains the only endpoint for policy processing and
automatic payment. The existing insecure-demo-identity gate and treasurer check
remain in force.

The endpoint behavior depends on the stored claim:

| Decision/state | Behavior |
|---|---|
| no decision / `submitted` | Read the mandate, evaluate policy and atomically store the decision |
| `review` / `awaiting_review` | Return the stored decision with `payment: null` |
| `reject` / `rejected` | Return the stored decision with `payment: null` |
| `auto_pay` / `approved` | Validate payment configuration, recheck the live mandate, reserve and attempt payment |
| `auto_pay` / `paying` | Return a reconciliation-required `409`; never sign again |
| `auto_pay` / `paid` | Return the stored successful payment idempotently |
| `auto_pay` / `payment_failed` | Return the stored failed payment idempotently |
| any inconsistent combination | Return a sanitized processing conflict |

The response continues to use the shared `ProcessClaimResponse`. `payment` is
non-null only for terminal `paid` or `payment_failed` claims.

## Architecture

### Claim-processing service

`createProcessClaimService` remains the application orchestrator. It owns:

- input and treasurer validation;
- idempotent terminal-state responses;
- initial policy evaluation and decision persistence;
- payment-configuration readiness checks;
- immediate pre-payment mandate re-evaluation;
- atomic reservation;
- classification of executor outcomes; and
- terminal persistence.

It depends only on repository, mandate-reader and payment-executor ports. It does
not import keypairs or Sui transaction-building modules.

### Payment executor port

Add a focused port under `packages/web/src/server/claims/ports.ts`:

```ts
export interface PaymentExecutor {
  assertReady(): void;
  execute(input: {
    claimId: string;
    mandateId: string;
    recipient: string;
    amount: string;
    budgetBefore: string;
  }): Promise<PaymentExecutionResult>;
}

export type PaymentExecutionResult =
  | { status: 'paid'; payment: PaymentResult }
  | { status: 'rejected'; payment: PaymentResult };
```

`assertReady` validates server configuration without changing claim state.
`execute` returns only confirmed terminal outcomes. It throws a distinct internal
uncertain-submission error when the adapter cannot prove whether the transaction
was accepted.

### Sui payment adapter

Add `packages/web/src/server/sui/payment-executor.ts`. The production adapter:

- supports testnet only;
- reads `AGENT_PRIVATE_KEY` and `AGENT_CAP_ID` lazily;
- parses the Sui private-key format and derives the sender address;
- validates the AgentCap ID as a canonical Sui object ID;
- uses the same official testnet USDC treasury configuration as the mandate reader;
- builds the transaction with `buildSpendTransaction`;
- signs and submits through an injected Sui client/signer boundary;
- waits for finality;
- reads the final mandate state to obtain `budgetAfter`;
- maps confirmed effects to the shared `PaymentResult`; and
- maps Move aborts through the existing treasury error parser.

No private key, signature, signed transaction bytes, raw RPC payload or raw provider
message may be returned, logged or persisted.

### Repository operations

Extend `ClaimRepository` with compare-and-set operations:

```ts
reservePayment(claimId: string): Promise<PaymentMutationResult>;

failApprovedPayment(input: {
  claimId: string;
  payment: PaymentResult;
}): Promise<PaymentMutationResult>;

finishPayment(input: {
  claimId: string;
  state: 'paid' | 'payment_failed';
  payment: PaymentResult;
}): Promise<PaymentMutationResult>;
```

`reservePayment` updates only `state = approved AND payment IS NULL`, changing the
state to `paying`. `failApprovedPayment` uses the same predicate and changes the
state directly to `payment_failed` for a definite preflight failure.
`finishPayment` updates only `state = paying AND payment IS NULL`.

A zero-row mutation reloads the claim. The caller returns a terminal winner,
returns a reconciliation conflict for `paying`, or reports an inconsistent-state
conflict. No mutation overwrites an existing payment.

## Detailed data flow

1. Parse the claim UUID and canonical processor address.
2. Load the claim plus event policy and verify the processor is the treasurer.
3. If the claim is terminal, return its stored result without reading Sui or loading
   the private key.
4. If it is `paying`, return a reconciliation-required `409` without signing.
5. If it is submitted, read the mandate, run `evaluatePolicy`, and atomically save
   the decision as already designed.
6. Stop for `review` and `reject` outcomes.
7. For `auto_pay`, call `assertReady` before changing the claim state. Missing or
   invalid configuration returns `503` and leaves the claim `approved`.
8. Re-read the current mandate and re-run `evaluatePolicy` immediately before
   reservation.
9. If the current snapshot is no longer `auto_pay`, atomically store a sanitized
   failed payment through `failApprovedPayment`. Do not sign.
10. Atomically reserve `approved -> paying`. Only the request that stores this
    transition may invoke the executor.
11. Build, sign and submit exactly once.
12. A confirmed successful transaction produces a successful `PaymentResult` and
    atomically stores `paying -> paid`.
13. A definite construction, signing or confirmed chain rejection produces a safe
    failed `PaymentResult` and atomically stores `paying -> payment_failed`.
14. An uncertain submission returns a sanitized `502` and deliberately leaves the
    claim `paying` for manual reconciliation.
15. If terminal persistence loses a race, return the stored terminal winner. If the
    database write fails after a confirmed transaction, return a sanitized database
    error; the claim remains `paying` and must not be automatically signed again.

The Sui Move contract remains the final authority and rechecks AgentCap ownership,
mandate identity, revocation, expiry, allowlist, amount and remaining budget.

## Payment result mapping

### Confirmed success

The stored `PaymentResult` contains:

- `ok: true`;
- the confirmed transaction digest;
- checkpoint when returned by the client;
- total gas used in base units when effects expose it;
- measured finality duration;
- null abort fields and raw error;
- a stable success message;
- `budgetBefore` from the pre-payment mandate; and
- `budgetAfter` from the post-finality mandate read.

### Confirmed rejection or preflight failure

The stored `PaymentResult` contains:

- `ok: false`;
- a digest only if the rejected transaction has a confirmed digest;
- checkpoint and gas when confirmed and available;
- a mapped abort code/key when available;
- a stable sanitized message;
- `rawError: null`; and
- equal before/after budgets unless a confirmed post-finality read proves otherwise.

### Uncertain result

No `PaymentResult` is stored because doing so would falsely claim a terminal chain
outcome. The state remains `paying`.

## Error model

Add stable server error codes:

- `payment_configuration_failed` — `503`, invalid or missing server-only agent
  configuration, no state mutation;
- `payment_submission_uncertain` — `502`, the request cannot prove whether Sui
  accepted the transaction, state remains `paying`; and
- reuse `processing_conflict` — `409`, another request reserved the payment or the
  claim requires reconciliation.

Confirmed Move rejection is a domain result, not a leaked provider exception. It
returns a normal process response containing a `payment_failed` claim and sanitized
failed `PaymentResult`.

Unknown repository failures remain `database_failed`. Error causes are internal
only and must never be serialized by the route.

## Configuration and secret handling

- `AGENT_PRIVATE_KEY` and `AGENT_CAP_ID` remain server-only environment variables.
- Neither variable may use a `NEXT_PUBLIC_` prefix.
- The key is loaded only when an eligible approved claim reaches payment readiness.
- Module import must not read the key, allowing builds and non-payment routes to run
  without signing configuration.
- The production adapter refuses non-testnet configuration in this increment.
- Tests use fake signers and clients and never read a real key.
- Repository secret scans must show no credential-like values in changed files.

## Testing strategy

### Service tests

Cover:

- review and reject decisions never calling payment readiness or execution;
- a new `auto_pay` decision proceeding through readiness, preflight, reservation,
  execution and terminal persistence;
- an existing approved decision proceeding to payment without overwriting the
  decision;
- already paid and payment-failed claims returning stored results idempotently;
- a paying claim returning reconciliation conflict without signing;
- missing configuration leaving the claim approved;
- changed preflight mandate recording payment failure without signing;
- a lost reservation race allowing only the winner to execute;
- confirmed success and rejection persistence;
- uncertain submission leaving the claim paying;
- terminal persistence races returning the stored winner; and
- sanitized database and infrastructure failures.

### Repository tests

Verify exact compare-and-set filters for reservation, preflight failure and terminal
completion, plus zero-row reload behavior for paid, failed, paying and inconsistent
states.

### Adapter tests

Use injected fake signer/client operations to verify:

- lazy configuration validation;
- invalid private key and AgentCap rejection without secret echoing;
- exact transaction-builder inputs;
- successful result mapping;
- Move abort mapping;
- uncertain transport-error classification;
- finality duration and gas mapping; and
- post-finality budget mapping.

### Route and workspace verification

Route tests verify stable status codes and sanitized JSON. Completion requires:

- full Vitest suite;
- TypeScript checks;
- production Next.js build;
- clean `npm ci`;
- `npm audit --audit-level=high`;
- `git diff --check`;
- credential scan; and
- confirmation that no test or verification command broadcasts a transaction.

## Acceptance criteria

The increment is complete when:

- only `auto_pay` claims can reach the executor;
- concurrent requests cannot invoke the executor more than once;
- successful payments persist a digest and `paid` state;
- confirmed failures persist `payment_failed` safely;
- uncertain submissions remain `paying` and cannot auto-retry;
- terminal requests are idempotent;
- configuration and provider errors are sanitized;
- no secret or signed payload enters the repository or response;
- all mandatory project documentation reflects the new payment boundary; and
- all automated verification passes without broadcasting funds.
