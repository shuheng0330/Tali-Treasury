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

An aborted transaction is atomic: its requested payment and state changes are
rolled back together. If it was submitted to the network rather than only dry
run, the sender still pays gas because validators performed the checks.
