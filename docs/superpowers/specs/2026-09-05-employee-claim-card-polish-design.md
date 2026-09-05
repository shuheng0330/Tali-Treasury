# Employee Claim Card Polish

## Goal

Make the employee-facing claim history on `/requests/expense` easy to scan on a
phone. The change must present the same saved reimbursement quote evidence as
the treasury view without changing claim data, API contracts, calculations,
authorization, or payment behavior.

## Presentation Design

Each claim is an independent rounded card separated from adjacent claims by a
16px gap. Its first view contains only the information needed to recognize the
claim and understand its outcome:

- merchant and original amount;
- claim status;
- payout amount in USDC;
- saved MYR/USD rate;
- relative update time; and
- the existing payment transaction link when available.

The visual language remains Tali's existing restrained monochrome layout with
status color reserved for state. No new palette, typography, animation, or
decorative component is introduced.

## Exchange-Rate Evidence

`ClaimHome` will render the existing `FxQuoteSummary` with its `compact`
variant. This keeps employee and treasury quote evidence on one implementation.
The collapsed summary shows the USDC payout, the MYR/USD rate, and whether the
saved quote was used.

The semantic `Rate Details` disclosure contains compact labelled rows for the
provider, rate, human-readable publication time, human-readable expiry or
`Expired`, USD parity, and six-decimal rounding. Raw ISO timestamps and the
long currency-exchange disclaimer will not appear in the collapsed card.

## Component Boundary and Data Flow

No new domain component or state is needed. `ClaimHome` continues to receive
the authoritative `Claim[]`, and each claim is passed unchanged to
`ClaimStatusSummary`, `FxQuoteSummary`, `Money`, and the existing explorer-link
builder. Only the `FxQuoteSummary` presentation variant and list/card layout
classes change.

Missing quotes continue to render no FX block. Existing loading, empty,
correction, status, and paid-transaction states remain intact.

## Responsive and Accessibility Behavior

Cards use safe wrapping for long merchant names and monetary values. Their
content remains single-column on narrow screens, with existing flexible header
wrapping. `Rate Details` remains a native `<details>` disclosure with visible
keyboard focus and at least a 44px summary target through the shared disclosure
style.

## Verification

Add a regression test that first fails against the existing employee view and
then proves that:

- `ClaimHome` requests the compact FX variant;
- claims render as separate cards with spacing instead of one divided panel;
- compact rate evidence uses readable dates and excludes raw ISO strings and
  the repeated Testnet-payment paragraph; and
- loading, empty, status, correction, and transaction-link behavior remains
  represented by the existing implementation and tests.

Run the complete application tests, typecheck, production build, dependency
audit, diff check, conflict-marker scan, and secret scan. Update
`PROJECT_REQUIREMENTS.md`, `ARCHITECTURE_AND_CODING_DESIGN.md`, and
`PROJECT_STATUS.md` because this changes customer-facing requirements,
presentation reuse, and delivery status.
