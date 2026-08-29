# Tali Treasury

Tali Treasury is an AI-assisted reimbursement system for student organisations.
A treasurer funds a mandate with Circle Testnet USDC, an agent evaluates receipt
claims, and the Sui Move contract remains the final authority over budget,
per-claim limits, expiry, revocation, and approved recipients.

> Testnet only. All SUI and USDC used here have no financial value.

## Project status

Status words are intentionally precise:

- **Live** — verified against Sui Testnet.
- **Complete locally** — implemented and testable, but not a hosted live flow.
- **Mocked** — useful UX or integration scaffolding that performs no external action.
- **Pending** — not present in the integrated repository yet.

| Area | Status | Evidence or next action |
| --- | --- | --- |
| Move treasury and 17 contract tests | **Complete locally** | `sui move test` |
| Published package | **Live** | Package `0x7be8…c523` on Testnet |
| Official Testnet USDC mandate | **Live** | 20 USDC funded; 5 USDC maximum per claim |
| Valid reimbursement | **Live** | 3 USDC paid; 17 USDC remains |
| Overspend and recipient protections | **Live** | Both invalid transactions rejected on-chain |
| TypeScript Sui integration | **Complete locally** | Reads, PTB builders, amount helpers, error mapping |
| Treasurer mandate dashboard | **Live** (read-only) | Server reads the current mandate from Sui Testnet |
| Claim, review, revoke, and Safety Test interactions | **Mocked** | Clearly labelled; no signing or state changes |
| Gemini, Supabase, deterministic backend agent | **Pending** | Backend team integration |
| Wallet connection and live UI writes | **Pending** | Add after backend/signing boundary is agreed |
| Hosting and submission pack | **Pending** | Final integration phase |

The detailed team checklist lives in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Live Testnet proof

| Item | Identifier |
| --- | --- |
| Package | [`0x7be8aa…9dc523`](https://suiscan.xyz/testnet/object/0x7be8aa82872facbd01372cdeb20375a82f74011dca1512e41737664a759dc523) |
| USDC mandate | [`0x16b9fd…3c7f6f`](https://suiscan.xyz/testnet/object/0x16b9fdc16764d6fa514fb6da55df5ca840d30e5bb057eba6a5ab67cf743c7f6f) |
| Successful 3 USDC payment | [`Aksj8w…5yQXA`](https://suiscan.xyz/testnet/tx/Aksj8wgVoVRnbkVDyCMQ4qMKa1HfkWqDWF8Xptz5yQXA) |
| Rejected 15 USDC overspend | [`5fMDNz…2PNpU`](https://suiscan.xyz/testnet/tx/5fMDNz9dAxJFiamg5Bi5iXnPjnHv2HTUB3hv2wJ2PNpU) |
| Rejected unknown recipient | [`2htVB5…GDnk5e`](https://suiscan.xyz/testnet/tx/2htVB5NJCxhz1QXQtLGDjJ6kLVAwit6MLqzghzGDnk5e) |

The current mandate began with `20 USDC`, allows at most `5 USDC` per claim,
has paid `3 USDC`, and has `17 USDC` remaining.

## How the pieces fit

```text
Member UI (mocked claim submission)
             |
             v
Gemini + policy backend (pending)
             |
             v
@tali/treasury-sui (readers and unsigned transaction builders)
             |
             v
Sui Testnet Mandate<USDC> (live enforcement and audit events)
```

The web application reads public mandate state without a key. State-changing
operations must be signed by the correct wallet or server agent and are outside
the current UI integration.

## Repository structure

| Path | Purpose | Primary owner |
| --- | --- | --- |
| `contracts/tali_treasury` | Move package, tests, deployment and USDC operations | Shu Heng |
| `packages/sui-integration` | `@tali/treasury-sui` chain boundary | Shu Heng |
| `packages/shared` | JSON-safe domain types and API contracts | Shared; coordinate first |
| `packages/web` | Next.js product UI and future API routes | Ku Kian Xiang / Lim Wey Cheng |
| `docs` | Design rules, ownership, and team progress | Shared; coordinate first |

See [`docs/OWNERSHIP.md`](docs/OWNERSHIP.md) before editing shared paths.

## Prerequisites

- Node.js 22 or a compatible current LTS release.
- npm.
- Sui CLI `1.78.1` with the Testnet-compatible Move framework.
- A Sui Testnet client configuration for Move tests and CLI verification.

## Fresh-clone setup

```powershell
git clone https://github.com/shuheng0330/Tali-Treasury.git
cd "Tali-Treasury"
npm install
Copy-Item .env.example packages/web/.env.local
npm run build
npm test
npm run typecheck
```

The ordered root build compiles `@tali/treasury-sui`, then `@tali/shared`, then
`@tali/web`, so a fresh clone does not depend on an old untracked `dist` folder.

Run the web application:

```powershell
npm run dev
```

Then open `http://localhost:3000/treasury`. The page should say **Live from Sui
Testnet** and display the current mandate state. Other product flows are marked
as simulations until their backend or signing integration exists.

Run Move tests separately:

```powershell
cd contracts/tali_treasury
sui move test
```

## Environment and secrets

Copy `.env.example` to `packages/web/.env.local`. Package, mandate, capability,
wallet addresses, and transaction digests are public blockchain identifiers.
Private keys, recovery phrases, Gemini keys, and Supabase service-role keys are
secrets.

Never:

- commit a private key or recovery phrase;
- add `AGENT_PRIVATE_KEY` or a service-role key to a `NEXT_PUBLIC_` variable;
- construct Sui transactions directly in the web UI instead of using
  `@tali/treasury-sui`;
- treat a simulated digest or result as on-chain evidence.

Both treasurer and agent wallets need Testnet SUI for gas even when the mandate
holds USDC.

## Integration handoff

Frontend:

- Import JSON-safe application types from `@tali/shared`.
- Import chain reads, configuration, and transaction builders from
  `@tali/treasury-sui`.
- Treat `MandateView` as the API/UI projection of the bigint-based `MandateState`.

Backend:

- Implement the endpoint contracts already defined in `packages/shared/src/api.ts`.
- Keep the agent private key server-side.
- Re-run deterministic policy checks before building and signing a payment.
- Store receipt hashes and private receipt objects outside the chain.

Immediate next vertical slice:

1. Replace simulated receipt analysis with Gemini and private storage.
2. Persist claims and exact receipt hashes.
3. Return uncertain claims to the review queue.
4. Sign one valid `buildSpendTransaction` call from the backend agent.
5. Refresh the live mandate dashboard after finality.

## Documentation index

- [`docs/PROGRESS.md`](docs/PROGRESS.md) — authoritative team status and next work.
- [`docs/OWNERSHIP.md`](docs/OWNERSHIP.md) — path ownership and coordination rules.
- [`docs/DESIGN.md`](docs/DESIGN.md) — binding UI design rules.
- [`contracts/tali_treasury/DEPLOYMENT.md`](contracts/tali_treasury/DEPLOYMENT.md) — authoritative deployed objects and transaction evidence.
- [`contracts/tali_treasury/USDC_SETUP.md`](contracts/tali_treasury/USDC_SETUP.md) — faucet, funding, and recreation procedure.
- [`contracts/tali_treasury/ERROR_CODES.md`](contracts/tali_treasury/ERROR_CODES.md) — Move abort-code contract.
- [`packages/sui-integration/README.md`](packages/sui-integration/README.md) — chain reader and transaction-builder usage.
