# Local single-wallet reimbursement demo

Created with user approval on 3 September 2026. This is a separate local Supabase
event backed by a real Sui Testnet mandate. The original event, mandate, claim
history, and hosted configuration were not changed.

## Setup evidence

- Creation transaction: `HC81t2fynCeqm2dgnfRVcpqXMA6j1crHbzhXRCwH2fng`
- Event: `223d1aa1-2c95-449d-94b3-36083c83016c`
- Mandate: `0x1cc179098026a7a8f323ee926ee4e81d1805ed4cc512f195a91e6b925ee5cd34`
- AdminCap: `0xdbf079d1964dda4b558a2fcf9888430869de8c7a816afd9c9929f00a2100250a`
- AgentCap: `0x9adcf422eee1660adec815b91bff64c6fa0fc28401e36de24143fdd1a77322b1`
- Package and official Circle USDC type: unchanged from `taliTestnetUsdcConfig`.
- Initial budget: 10 USDC. Per-claim cap: 5 USDC.
- Expiry: 7 September 2026, 00:00 Singapore time (`2026-09-06T16:00:00Z`).
- Actual creation gas: 0.005364984 SUI; approved maximum: 0.02 SUI.
- Treasurer wallet retained 10 USDC from the fresh 20 USDC faucet allocation.

## Roles (deliberately simplified for the demo)

- Claimant, only approved recipient, and local event reviewer: Slush wallet
  `0xc49326adb506e0716c8beaf69885f4e008d34e116d277da49e253a72e82647b7`.
- On-chain AdminCap stays with the original CLI treasurer:
  `0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9`.
- New AgentCap is owned by the existing backend agent:
  `0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471`.

The same person submits and reviews. This proves the workflow, not separation
of duties. Wallet authentication, receipt checks, quote acceptance, and on-chain
limits remain enforced. Slush does not receive admin control of the mandate.

## Local configuration

The ignored `packages/web/.env.local` selects the new mandate, AgentCap, AdminCap,
and event. `NEXT_PUBLIC_DEMO_EVENT_NAME` controls the displayed name;
`NEXT_PUBLIC_SINGLE_WALLET_DEMO=true` displays the disclosure on both screens.
These public variables do not grant permissions. Backend database roles do.
No private key was copied or changed; no insecure identity bypass was enabled.

Restart `npm run dev -w @tali/web` after changing environment variables.
For a production-mode local server, rebuild before restarting because public
variables are bundled at build time.

## Verified browser reimbursement

On 3 September, the user submitted and approved an RM6 KOPI KITA receipt dated
3 September. The saved Open Exchange Rates quote was 1 USD = 4.0416 MYR,
valuing USDC at USD parity. The backend paid **1.484561 USDC** to Slush.

- Claim: `65dc9a7a-3cbe-4a34-80a8-b1c9d8db3b50`
- Payment: `J6fWBNa7RQXiLaVVK4ZhZSNphggNLq312HKRyhRbZQq`
- Checkpoint: `379316730`
- Remaining budget after payment: **8.515439 USDC**
- Actual payment gas: **0.002369900 SUI** (the backend fee field still has the
  separately documented overcounting issue).

Database Paid status, PaymentMade event, recipient balance change, and mandate
balance were independently checked. This payment completed normally; fault recovery
was tested separately. The future-dated receipt is a review/correction example,
not automatically a rejected payment.

## Repeat the manual demo

1. Sign in with Slush at `/claim`. Confirm the single-wallet event and current budget.
2. Upload a new MYR receipt within the event and no later than today (3 September
   at the time of verification). A small amount such as RM5–10
   is comfortably below the 5 USDC cap at typical MYR/USD rates; the actual quote
   and policy checks determine eligibility. Do not alter a real receipt's date.
   If using a synthetic receipt, visibly label it as demo data.
3. Confirm extracted fields and submit. This should create a claim, not a payment.
4. At `/treasury`, use the same signed-in Slush wallet and choose
   **Get live quote & evaluate**. Read any review/rejection reasons.
5. Only approve when ready to send Testnet USDC. MYR claims require explicit
   approval of the quoted amount. An expired quote must be refreshed.
6. Verify **Paid**, the transaction digest, the recipient, and the new budget.
   If the claim remains **Paying**, use the reconciliation control to check the
   existing digest; do not create another claim to retry the payment.

Setup itself did not submit a claim or make a reimbursement. Earlier recovery
testing is recorded separately in `LOCAL_PAYMENT_RECONCILIATION_SMOKE.md`.

## Restore the historical local demo

Restore the original mandate and AgentCap from `taliUsdcDemo`, set
`NEXT_PUBLIC_DEMO_EVENT_ID=ba7e50e2-7e7b-4a67-a505-9e3a329739ae`,
`NEXT_PUBLIC_DEMO_EVENT_NAME=Orientation Week`, and
`NEXT_PUBLIC_SINGLE_WALLET_DEMO=false`; restore the original AdminCap if used.
Restart/rebuild the app as above. This does not delete either event or move funds.
Do not repoint old paid claims at the new mandate.

Hosted rollout, claim payment, commit, and push are separate actions, not performed
as part of this setup. A local database reset would remove this locally inserted
event; preserve these public IDs if recreating it. It is not a hosted seed migration.
