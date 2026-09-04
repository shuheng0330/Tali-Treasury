# Path ownership

Three people, mostly working alone at night. Stay inside your paths and we don't collide.

| Owner | Role | Paths |
|---|---|---|
| Shu Heng | Move + Sui | `contracts/**`, `packages/sui-integration/**` |
| Lim Wey Cheng | AI + backend | `packages/web/src/app/api/**`, `packages/web/src/server/**` |
| Ku Kian Xiang | Frontend + product | `packages/web/src/app/(app)/**`, `packages/web/src/components/**` |
| Everyone (heads-up first) | Contracts | `packages/shared/**`, `.env.example`, `docs/**` |

## Payroll-first feature ownership

| Deliverable | Lead | Required support |
|---|---|---|
| Configure package v2, create mandate and stream, record evidence | Shu Heng | Payroll upgrade is complete; team supplies the agreed employee and stand-in recipients |
| Sui payroll builders/readers and setup transaction boundary | Shu Heng | Backend and frontend consume the boundary; they do not duplicate it |
| Verified payroll registration and employer/employee authorization | Lim Wey Cheng | Shu Heng supplies object invariants; Kian Xiang supplies request/UI states |
| Set Up Payroll, payroll run, proof and earnings UX | Ku Kian Xiang | Backend endpoint contracts and Sui transaction builder |
| Hosted end-to-end verification and rehearsal | Everyone | One shared configuration and acceptance checklist |

**Set Up Payroll** and **Create Expense Treasury** are separate workstreams.
Changing one flow must not silently change the other's mandate IDs, caps, employees,
recipients or environment variables.

## Rules

1. **`packages/shared` changes need a message in the group chat before you push.**
   Everything downstream compiles against it.
2. **Never define a local copy of a shared type.** If `Claim` is missing a field, add it
   to `packages/shared/src/claims.ts`.
3. **Chain types come from `@tali/treasury-sui`, not from `@tali/shared`.**
   `MandateState` uses `bigint`; `MandateView` is its JSON-safe projection for API
   responses. Convert with `toMandateView`.
4. **Frontend may build against mocks until an endpoint exists, but every mocked
   state remains labelled.** Payroll is not live merely because IDs are present.
5. **Branch per person**, merge to `main` when green: `Shuheng`, `Xiang-UI`, `feat/backend`.
6. **Never commit a key.** Before submission we scan the whole history — a leaked key is
   both a disqualification risk and a real loss of funds.
7. **Public IDs may be committed; signing material may not.** Package, mandate,
   capability, stream and transaction identifiers are public. Private keys,
   recovery phrases and service-role credentials stay in secret storage.

## Environment

Copy `.env.example` to `packages/web/.env.local`. `AGENT_PRIVATE_KEY` must **never** get
a `NEXT_PUBLIC_` prefix; Next.js inlines those into the client bundle, which would
publish the treasury key to every visitor.

## Two addresses, both need SUI

The treasurer address and the backend agent address are different and **both pay their
own gas**. Fund both from the faucet early. Discovering the agent has zero SUI mid-demo
costs an hour to a faucet cooldown.

## Sui toolchain

WSL2. The installer is a shell script with no native Windows equivalent, and OneDrive
corrupts Move build artefacts — keep the repo outside any synced folder.

```sh
wsl --install -d Ubuntu
```

Then inside Ubuntu:

```sh
curl -sSfL https://raw.githubusercontent.com/Mystenlabs/suiup/main/install.sh | sh
suiup install sui@testnet
sui --version
```

Install `sui@testnet` specifically. A CLI built against a newer framework than testnet
fails to publish with confusing dependency errors.

## Package versions

Most tutorials online target APIs that no longer exist.

| Package | Version | Note |
|---|---|---|
| `@mysten/sui` | 2.27.1 | `@mysten/sui.js` is dead. `TransactionBlock` → `Transaction`. ESM only. |
| `@mysten/dapp-kit-react` | 2.1.22 | Rewrite: one `DAppKitProvider`, `useDAppKit()` actions. No `SuiClientProvider`/`WalletProvider` stack. |

Pick one dApp Kit API and don't mix it with the legacy one.
