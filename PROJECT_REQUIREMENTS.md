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

## Explicitly out of scope for this increment

- wallet-signature authentication;
- cryptographic or one-time binding between analysis and claim creation;
- deterministic policy evaluation and review actions;
- agent private-key use, Sui transaction construction, signing or payment;
- frontend replacement of current mock claim data;
- hosted migration or production readiness.

These boundaries must be resolved before real-fund authorization.
