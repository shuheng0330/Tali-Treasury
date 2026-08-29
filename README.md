# Tali Treasury

Tali Treasury is an AI reimbursement assistant for student organizations. Its
Sui Move contract holds an event budget and enforces agent spending limits,
expiry, revocation, and approved recipients on-chain.

## Repository structure

- `contracts/tali_treasury`: Move smart contract, tests, and Testnet deployment notes.
- `packages/sui-integration`: shared TypeScript transaction and query wrapper.

## Verify the project

```powershell
cd contracts/tali_treasury
sui move test

cd ../..
npm install
npm test
npm run typecheck
npm run build
```

See `contracts/tali_treasury/DEPLOYMENT.md` for the current Testnet objects and
`packages/sui-integration/README.md` for frontend and backend integration.
