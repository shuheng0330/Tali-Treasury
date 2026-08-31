# Project requirements

## Product goal

Tali Treasury helps student organisations reimburse verified event expenses while
keeping treasury limits enforceable by the existing Sui Move mandate.

## Implemented receipt-backend scope

The current backend increment must:

- accept one JPEG, PNG, or WebP receipt up to 10 MiB;
- require an event UUID and canonical Sui submitter address;
- require the submitter to be an active event member;
- calculate SHA-256 from the original receipt bytes;
- detect exact duplicates within the same event while allowing the same bytes in
  another event;
- extract merchant, amount, currency, date and category through Gemini structured
  output without inventing uncertain values;
- represent money as positive USDC base-unit decimal strings;
- store receipt objects in a private Supabase bucket;
- persist claims using the categories, states and response types from
  `@tali/shared`;
- return short-lived signed receipt URLs only after checking the explicit demo
  viewer is an active event member;
- expose analyze, create-claim and list-claims API routes;
- return stable, sanitized API errors without credentials or provider details.

## Implemented deterministic-policy scope

The server policy evaluator must:

- return the shared `PolicyDecision` contract without performing database, network,
  wallet or filesystem I/O;
- evaluate the per-claim cap, remaining mandate budget, recipient allowlist,
  revocation, mandate expiry, exact duplicate status, allowed category, receipt
  date and receipt-extraction certainty;
- use integer USDC base-unit comparisons, accepting an amount equal to the cap or
  remaining budget;
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

## Implemented claim-processing scope

The claim-processing endpoint must:

- remain disabled unless insecure demo identity mode is explicitly enabled;
- accept a claim UUID and canonical processor address;
- allow only the event's configured treasurer to trigger processing;
- return a stored decision idempotently without rereading Sui;
- load the current read-only mandate snapshot for a new submitted claim;
- persist exactly one decision through a compare-and-set update;
- map `auto_pay` to `approved`, `review` to `awaiting_review`, and `reject` to
  `rejected`;
- return a concurrent winner's stored decision rather than overwriting it; and
- return `payment: null` without constructing, signing or broadcasting a
  transaction.

An `approved` claim is ready for a later payment step; it is not paid.

## Security and business rules

- Gemini and Supabase credentials are server-only and must never use a
  `NEXT_PUBLIC_` prefix.
- Application tables use Row Level Security with no browser policies and no
  `anon` or `authenticated` table privileges.
- Only the server role may access application tables and private receipt objects.
- Service-role-backed APIs fail closed unless controlled demo identity mode is
  explicitly enabled; hosted use requires real wallet/session authentication.
- Amounts must be positive integers below 10^30 base units.
- Sui addresses and object IDs must be canonical lowercase 32-byte hex values.
- Claim fields must match the validated receipt analysis supplied at confirmation.
- A database unique constraint is the final race-safe same-event duplicate guard.

## Hosted demo configuration

- Demo event `ba7e50e2-7e7b-4a67-a505-9e3a329739ae` uses the official USDC mandate.
- Shu Heng, Lim Wey Cheng, and Kian Xiang must each be active event members under
  their confirmed canonical Sui wallet addresses.
- Demo membership migrations must be idempotent and must not delete unrelated
  event members.

## Explicitly out of scope for this increment

- wallet-signature authentication;
- cryptographic or one-time binding between analysis and claim creation;
- treasurer review actions and review-driven claim-state transitions;
- agent private-key use, Sui transaction construction, signing or payment;
- frontend replacement of remaining mock policy and payment data;
- production readiness; the schema is hosted, but real identity, deployed API
  configuration and end-to-end verification remain pending.

These boundaries must be resolved before real-fund authorization.
