# Project requirements

## Product goal

Tali Treasury helps student organisations reimburse verified event expenses while
keeping treasury limits enforceable by the existing Sui Move mandate.

## Implemented receipt-backend scope

The current backend increment must:

- accept one JPEG, PNG, or WebP receipt up to 10 MiB;
- require an event UUID and derive the canonical submitter from a wallet session;
- require the submitter to be an active event member;
- calculate SHA-256 from the original receipt bytes;
- detect exact duplicates within the same event while allowing the same bytes in
  another event;
- extract merchant, amount, currency, date and category through Gemini structured
  output without inventing uncertain values;
- preserve the receipt amount and ISO currency as six-decimal fixed-point units;
- store receipt objects in a private Supabase bucket;
- persist claims using the categories, states and response types from
  `@tali/shared`;
- create a private 15-minute analysis draft and expose only its opaque ID;
- consume each draft atomically once when creating its claim;
- return short-lived signed receipt URLs only after checking the session wallet
  is an active event member or the configured treasurer;
- expose analyze, create-claim and list-claims API routes;
- return stable, sanitized API errors without credentials or provider details.

## Implemented deterministic-policy scope

The server policy evaluator must:

- return the shared `PolicyDecision` contract without performing database, network,
  wallet or filesystem I/O;
- evaluate the per-claim cap, remaining mandate budget, recipient allowlist,
  revocation, mandate expiry, exact duplicate status, allowed category, receipt
  date and receipt-extraction certainty;
- use integer USDC base-unit comparisons for USDC claims, accepting an amount
  equal to the cap or remaining budget;
- route non-USDC receipts to review and defer mandate amount checks until an
  explicit USDC conversion quote is attached;
- require at least 90% Gemini confidence with no uncertain fields or warnings;
- validate canonical receipt dates within the event window and no later than the
  current UTC date;
- reject exact duplicates and claims that cannot satisfy the current Sui mandate;
- send correctable category, date and extraction exceptions to treasurer review;
- make hard rejection take precedence when review and rejection failures coexist;
  and
- explain every check without exposing receipt contents, credentials or provider
  errors.

The evaluator mirrors on-chain rules for early routing. The Sui Move contract is
still the final payment authority.

## Implemented claim-processing and testnet-payment scope

The claim-processing endpoint must:

- accept a claim UUID and derive the processor from the session;
- allow only the event's configured treasurer to trigger processing;
- return a stored decision idempotently without rereading Sui;
- load the current read-only mandate snapshot for a new submitted claim;
- reject a mandate whose object ID or coin type differs from the event and
  configured official testnet USDC treasury;
- persist exactly one decision through a compare-and-set update;
- map `auto_pay` to `approved`, `review` to `awaiting_review`, and `reject` to
  `rejected`;
- return a concurrent winner's stored decision rather than overwriting it;
- attempt payment only for an `auto_pay` decision and only when the treasurer
  invokes the process endpoint;
- validate server-only testnet credentials lazily and re-evaluate the live mandate
  immediately before payment;
- reserve signing through an atomic `approved -> paying` transition so only one
  concurrent request may submit;
- persist every confirmed outcome as terminal `paid` or `payment_failed` data;
- return stored terminal decisions and payment results idempotently without
  rereading Sui or signing again; and
- leave transport-uncertain submissions in `paying`, return a safe error, and
  prohibit automatic retry until reconciliation.

The backend signer is restricted to Sui Testnet. Its private key and owned
`AgentCap` ID are server-only values and must never enter a client bundle.

## Implemented treasurer-review scope

The review endpoint and treasury UI must:

- support one durable `approve`, `reject`, or `request_correction` action for an
  `awaiting_review` claim;
- require the authenticated wallet to be the event's configured treasurer;
- require a trimmed 1–500 character reason for rejection and correction;
- store review metadata on the claim and append exactly one immutable audit row
  in the same database transaction;
- use a compare-and-set transition so concurrent approvals can sign at most once;
- move approval directly to `paying`, rejection to `rejected`, and correction to
  `needs_correction`;
- allow human approval to override only category, receipt-date, or extraction
  confidence review failures;
- prohibit approval for non-USDC claims or any failed current on-chain check;
- re-read and re-evaluate the Sui mandate before recording approval;
- persist confirmed payment success or rejection, while leaving uncertain
  submissions in `paying` for reconciliation;
- return exact replays idempotently and reject conflicting review actions; and
- reload persisted claims after success and refresh mandate state after a
  completed payment.

## Implemented payment-reconciliation scope

The reconciliation endpoint and treasury UI must:

- derive the Sui transaction digest from signed bytes and atomically persist it,
  its prepared time, and the pre-payment budget before any broadcast;
- allow at most one payment attempt per claim and never persist transaction bytes,
  signatures, or keys;
- prohibit submission when attempt persistence fails or loses its compare-and-set;
- require the authenticated event treasurer and the exact configured origin for
  `POST /api/claims/:id/reconcile`;
- inspect only the stored digest for a `paying` claim and never sign or submit a
  replacement transaction;
- keep a transaction that is not yet found in `paying`, persist confirmed success
  as `paid`, and persist a confirmed Move rejection as `payment_failed`;
- return sanitized RPC uncertainty while preserving `paying`, and fail closed for
  a legacy `paying` claim that has no stored digest;
- return terminal reconciliation results idempotently; and
- expose the digest, explorer link, explicit status check, and bounded 20-second
  client polling in the treasury UI, with no scheduled background job.

## Security and business rules

- Payroll execution, mandate revocation, and safety-test broadcasts require an
  authenticated wallet matching the canonical server-only
  `TALI_EMPLOYER_WALLET` value.
- Salary-stream withdrawal requires an authenticated wallet matching the
  selected stream's immutable employee address; the employer is not a substitute.
- Exact-origin validation must precede session resolution, payload parsing,
  service mutation, transaction construction, and signing for these writes.
- Missing or malformed employer configuration fails closed with a sanitized 503;
  a valid but unauthorized session returns a sanitized 403.
- Rejected authorization requests must never invoke payroll, revocation, safety,
  or withdrawal mutation dependencies.
- Gemini and Supabase credentials are server-only and must never use a
  `NEXT_PUBLIC_` prefix.
- The backend-agent private key is server-only, testnet-only, loaded only when an
  eligible payment is requested, and must never be logged or persisted.
- Application tables use Row Level Security with no browser policies and no
  `anon` or `authenticated` table privileges.
- Only the server role may access application tables and private receipt objects.
- A five-minute human-readable Sui Testnet challenge must be single-use and bind
  the exact origin, wallet address, nonce, issue time, expiry and no-transaction statement.
- Valid wallet signatures create fixed one-hour opaque sessions; only SHA-256
  token hashes are persisted and raw tokens exist only in `tali_session`.
- The session cookie is `HttpOnly`, `SameSite=Strict`, path `/`, and `Secure` on HTTPS.
- Protected writes require the exact configured `TALI_APP_ORIGIN` header.
- A present invalid or expired cookie must never fall back to local demo identity.
- Hosted deployments keep `TALI_ALLOW_INSECURE_DEMO_IDENTITY=false`.
- Amounts must be positive integers below 10^30 base units.
- Sui addresses and object IDs must be canonical lowercase 32-byte hex values.
- Preserve the original validated receipt analysis when a member corrects the
  confirmed merchant, amount, date or category.
- A database unique constraint is the final race-safe same-event duplicate guard.

## Hosted demo configuration

- Demo event `ba7e50e2-7e7b-4a67-a505-9e3a329739ae` uses the official USDC mandate.
- Shu Heng, Lim Wey Cheng, and Kian Xiang must each be active event members under
  their confirmed canonical Sui wallet addresses.
- Demo membership migrations must be idempotent and must not delete unrelated
  event members.

## Explicitly out of scope for this increment

- trusted MYR-to-USDC quote ingestion, quote expiry and converted payout storage;
- scheduled or automatic background reconciliation;
- Sui Mainnet signing or any real-value payment;
- a live funded smoke transaction for this increment (automated verification uses
  injected fake operations and never broadcasts);
- member correction and resubmission after `request_correction`;
- employer-managed payroll and claim-member roster APIs;
- live browser presentation for payments initiated outside the review flow;
- production rollout of this new migration and hosted wallet-flow verification.

These boundaries must be resolved before real-fund authorization.
