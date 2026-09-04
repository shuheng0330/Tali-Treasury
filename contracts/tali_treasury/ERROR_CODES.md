# Tali Treasury error codes

The Move contract aborts a transaction when a treasury rule is violated. The
frontend or agent service should translate the numeric abort code into a clear
message for the user.

| Code | Move constant | Suggested user message |
| ---: | --- | --- |
| 0 | `E_ZERO_BUDGET` | The mandate budget must be greater than zero. |
| 1 | `E_INVALID_LIMIT` | The claim limit must be greater than zero and no larger than the budget. |
| 2 | `E_EMPTY_ALLOWLIST` | Add at least one approved recipient. |
| 3 | `E_WRONG_AGENT_CAP` | This agent is not authorized for the selected mandate. |
| 4 | `E_ZERO_AMOUNT` | The payment amount must be greater than zero. |
| 5 | `E_AMOUNT_ABOVE_LIMIT` | This claim exceeds the mandate's per-claim limit. |
| 6 | `E_INSUFFICIENT_BUDGET` | The mandate does not have enough remaining funds. |
| 7 | `E_RECIPIENT_NOT_APPROVED` | This recipient is not approved by the mandate. |
| 8 | `E_MANDATE_EXPIRED` | This mandate has expired. |
| 9 | `E_MANDATE_REVOKED` | This mandate has been revoked. |
| 10 | `E_WRONG_ADMIN_CAP` | This administrator is not authorized for the selected mandate. |
| 11 | `E_NO_FUNDS_TO_WITHDRAW` | The mandate has no remaining funds to withdraw. |

## Payroll module

`payroll.move` numbers its aborts from 20 so that a single lookup covers both
modules — Sui reports the code without saying which module raised it, and
overlapping numbers would silently mislabel a refusal. Codes 12–19 are reserved
and unused.

| Code | Move constant | Suggested user message |
| ---: | --- | --- |
| 20 | `E_WRONG_PAYROLL_CAP` | This capability is not authorized for the selected payroll mandate. |
| 21 | `E_PAYROLL_REVOKED` | This payroll mandate has been revoked. |
| 22 | `E_LENGTH_MISMATCH` | The statutory amounts do not line up with the recipients this mandate was created with. |
| 23 | `E_PAYROLL_ZERO_AMOUNT` | Every amount in a payroll run must be greater than zero. |
| 24 | `E_STATUTORY_SHORT` | A statutory contribution is below the minimum this mandate enforces. Nobody was paid. |
| 25 | `E_ABOVE_RUN_LIMIT` | This payroll run exceeds the mandate's per-run limit. |
| 26 | `E_PAYROLL_INSUFFICIENT` | The payroll mandate does not have enough unreserved funds. |
| 27 | `E_PAYROLL_EXPIRED` | This payroll mandate has expired. |
| 28 | `E_NOTHING_ACCRUED` | Nothing has accrued on this salary stream since the last withdrawal. |
| 29 | `E_WRONG_STREAM_MANDATE` | This salary stream belongs to a different payroll mandate. |
| 30 | `E_INVALID_STREAM_PERIOD` | A salary stream must end after it starts. |
| 31 | `E_EMPLOYEE_NOT_APPROVED` | This mandate is not allowed to pay that address. |
| 32 | `E_NET_ABOVE_GROSS` | Take-home pay cannot be larger than the wage it comes from. |
| 33 | `E_INVALID_PAYROLL_TERMS` | These mandate terms would not enforce anything. Check the floors, the run limit and the staff list. |
| 34 | `E_NO_PAYROLL_FUNDS` | Every remaining ringgit is already promised to an open salary stream. |

The TypeScript map lives in `packages/sui-integration/src/errors.ts` and must
stay in lockstep with both modules' Move constants.

An aborted transaction is atomic: its requested payment and state changes are
rolled back together. If it was submitted to the network rather than only dry
run, the sender still pays gas because validators performed the checks.
