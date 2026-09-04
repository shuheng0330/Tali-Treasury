# Payroll and Treasury Write-Route RBAC Design

**Date:** 3 September 2026
**Owner:** Lim Wey Cheng
**Target branch:** `codex/payroll-rbac`
**Base:** merged `origin/main` after PR #21

## Objective

Replace the global insecure-demo gate on four consequential write routes with
wallet-session authorization. Employer operations require one configured employer
wallet; salary withdrawal requires the employee recorded on the selected stream.
Every rejected request must stop before signing, submitting, revoking, running
payroll, or withdrawing funds.

This is the first of two separate increments. Employer-managed claim membership is
designed and implemented in a later branch after this security boundary is green.

## Scope

The guarded operations are:

| Route | Required actor |
|---|---|
| `POST /api/payroll/runs` | `TALI_EMPLOYER_WALLET` |
| `POST /api/mandate/revoke` | `TALI_EMPLOYER_WALLET` |
| `POST /api/safety/attack` | `TALI_EMPLOYER_WALLET` |
| `POST /api/streams/:id/withdraw` | `SalaryStreamView.employee` for that stream |

`GET /api/payroll/runs` remains outside this write-authorization increment. It does
not sign or mutate, and changing its visibility would require a separate product
decision about payroll-history privacy.

## Configuration

Add server-only `TALI_EMPLOYER_WALLET`. It must be a canonical lowercase Sui
address (`0x` followed by 64 lowercase hexadecimal digits). It must never use a
`NEXT_PUBLIC_` prefix.

Production composition validates this value lazily when an employer-only write is
requested. Missing or malformed configuration fails closed with a sanitized 503;
it never makes the write route public and never falls back to the demo flag.

Because `.env.example` is a shared-ownership path, the owner sends a group-chat
heads-up before adding the empty variable.

## Authentication and authorization flow

Each route keeps a small testable handler with injected dependencies. Production
composition reuses the existing wallet-auth repository, exact application origin,
and `resolveWalletIdentity` session resolver.

Employer-only request order:

1. Require the exact configured origin with `assertSameOrigin`.
2. Resolve `tali_session` with `resolveWalletIdentity`.
3. Validate and read `TALI_EMPLOYER_WALLET`.
4. Compare the lowercased authenticated and configured addresses.
5. Parse and validate the operation payload.
6. Invoke the existing payroll, revoke, or safety dependency.

Stream withdrawal request order:

1. Require the exact configured origin.
2. Resolve the authenticated wallet session.
3. Validate the stream ID and read the stream through the existing service.
4. Compare the authenticated wallet with the stream's immutable `employee`.
5. Invoke withdrawal only for the matching employee.

Reading the stream before the ownership comparison is required because ownership is
resource-specific. A failed read uses the existing sanitized stream/chain error. A
successful read followed by an ownership mismatch never invokes withdrawal.

`requireDemoIdentityEnabled()` is removed from these four POST paths. Retaining it
would make the routes unusable in the required hosted configuration, where
`TALI_ALLOW_INSECURE_DEMO_IDENTITY=false`. Wallet connection alone is insufficient;
the caller must have an active signed session.

## Authorization boundary

The application guard protects access to server-held signing capabilities:

- the employer may initiate payroll, irreversible mandate revocation, and the
  adversarial safety transaction;
- only an employee may request withdrawal from that employee's salary stream;
- the employer is not implicitly allowed to withdraw an employee's accrued salary;
- a member or backend-agent wallet has no employer authority merely because it is
  registered in the event.

The Move contract remains the final authority after application authorization. A
successful authorization check does not bypass any on-chain capability, budget,
recipient, expiry, revocation, or accrual rule.

## Errors

All responses use the existing `ApiError` serialization and expose no provider,
database, RPC, cookie, signature, or key details.

| Condition | HTTP | Code | Safe message intent |
|---|---:|---|---|
| Missing, invalid, or expired session | 401 | `authentication_required` | Sign in again |
| Origin mismatch | 403 | `origin_forbidden` | Request origin is not allowed |
| Authenticated wallet lacks authority | 403 | `forbidden` | Wallet is not authorized for this action |
| Missing/malformed employer configuration | 503 | `authorization_configuration_failed` | Authorization configuration is unavailable |
| Invalid payload or missing stream ID | 400 | `invalid_request` | Existing validation message |
| Missing stream | 404 | `stream_not_found` | Existing safe not-found message |

The two new error codes are added to the server error union. Route-specific internal
causes are retained only for logs/debugging and are never serialized.

## Test design

Every employer-only route receives handler-level tests proving:

- the configured employer succeeds;
- a different authenticated wallet receives 403;
- a missing or expired session receives 401;
- an incorrect origin receives 403;
- missing or malformed employer configuration receives 503;
- the existing operation dependency is not called after any rejection; and
- operation failures continue to use sanitized existing error responses.

Stream-withdrawal tests prove:

- the authenticated stream employee may withdraw;
- the employer and unrelated wallets receive 403;
- the stream is read before the ownership decision;
- withdrawal is never called on an ownership mismatch;
- missing session and origin mismatch fail before a stream read; and
- stream read/refusal results preserve the existing response contract.

The final verification sequence is:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --audit-level=high
git diff --check origin/main...HEAD
```

Automated tests inject all chain-facing operations and never broadcast.

## Documentation and rollout

Update `.env.example`, README, `PROJECT_REQUIREMENTS.md`,
`ARCHITECTURE_AND_CODING_DESIGN.md`, `PROJECT_STATUS.md`, and `docs/PROGRESS.md`.

Hosted rollout requires:

1. Set `TALI_EMPLOYER_WALLET` to the confirmed employer/treasurer address.
2. Keep `TALI_ALLOW_INSECURE_DEMO_IDENTITY=false`.
3. Redeploy after environment configuration.
4. Sign in as the employer and verify payroll, revoke, and safety authorization.
5. Sign in as a non-employer and confirm all three return 403 without a transaction.
6. Sign in as the stream employee and verify withdrawal authorization.
7. Sign in as another wallet and confirm withdrawal returns 403 without submission.

Any funded Testnet action remains separately authorized. Deployment verification
records only public transaction identifiers and never captures keys or session
cookies.

## Explicitly out of scope

- Employer-managed claims roster API or UI (next separate increment).
- Adding or removing payroll employees on-chain.
- Navigation hiding, redirects, or client-side role enforcement.
- Payroll-history read authorization.
- Rate limiting or a new authentication mechanism.
- Changes to Move contracts or shared API contracts unless compilation proves a
  shared error-code type must be extended.
- Mainnet signing or real-value payments.

## Acceptance criteria

The increment is complete when all four write routes enforce their specified wallet
authority from a signed session, exact-origin checks precede every write, rejected
requests cannot reach a signing/mutation dependency, all focused and repository-wide
checks pass, and hosted configuration/verification steps are documented separately
from local completion.
