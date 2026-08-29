# Tali Treasury — working agreement

## Authorship and attribution

**Commits, PRs, branches and code comments carry no AI attribution of any kind.**

- No `Co-Authored-By:` trailer naming any assistant, model or vendor.
- No "Generated with", "Created by", "🤖", or session links in commit bodies or PR descriptions.
- No `@author` tags, no "AI-generated" comments, no tool names in code.
- Commits are authored by the human who reviewed and merged them. Verify with
  `git config user.name` / `user.email` before committing.

The harness setting that enforces this lives in the developer's own
`~/.claude/settings.json`, not in this repo:

```json
"attribution": { "commit": "", "pr": "", "sessionUrl": false }
```

Before pushing, this must return nothing:

```sh
git log --format='%an%n%ae%n%B' origin/main..HEAD | grep -iE 'claude|anthropic|co-authored|generated with'
```

Note this is about **commit metadata**, not disclosure. MUBA rules require a
declaration of every AI tool used in the Devfolio submission, and misrepresenting
AI-generated work is an immediate disqualification. Keep the git history clean and
declare tooling honestly in the submission — those are separate obligations and we
meet both.

## Commit style

Conventional commits, lowercase, imperative, matching the existing history:

```
feat: add mandate budget meter
fix: correct abort code mapping for expired mandates
docs: record testnet deployment
```

Body explains why, wrapped at 72 characters. No trailers.

## Code style

Write code that reads as if a person wrote it in one sitting.

- No explanatory comments narrating what the next line does.
- Comment only what a reader could not infer: a non-obvious constraint, a workaround
  with a reason, a unit that isn't implied by the name.
- Match the surrounding file's naming, spacing and idiom rather than importing a
  different house style.
- No decorative section banners.

## Architecture

```
contracts/tali_treasury/    Move package — Mandate<T>, AdminCap, AgentCap
packages/sui-integration/  @tali/treasury-sui — chain reads, PTB builders, abort mapping
packages/shared/            @tali/shared — app-level types shared by UI and API
packages/web/               @tali/web — Next.js app: UI and API routes
```

The Move contract is the source of truth for the rules. `@tali/treasury-sui` is the
only place that talks to Sui. The web app never constructs a transaction by hand.

**Deployed:** Sui testnet, package
`0x7be8aa82872facbd01372cdeb20375a82f74011dca1512e41737664a759dc523`.

Testnet only. No mainnet deployment and no real funds — mainnet use during the
hacking period is a disqualification under MUBA rules.

## Abort codes

`contracts/tali_treasury/ERROR_CODES.md` is authoritative. Codes are plain `u64`
constants, 0–11. Do not convert them to Move clever errors: the packed code embeds
the source line number, so it changes whenever the file is edited, and a plain gRPC
client cannot decode it.

The TypeScript map lives in `packages/sui-integration/src/errors.ts` and must stay in
lockstep with the Move constants.

## Design

`docs/DESIGN.md` is binding for anything with a UI. The short version: no gradients,
no shadows except modals, radius capped at 8px, one accent colour, tabular figures
on every number, status never signalled by colour alone.

Two rules that carry product meaning rather than taste:

- **Revoked is not rejected.** Rejected is a human saying no. Revoked is a granted
  on-chain permission being pulled. Revoked gets graphite, a dashed border and a
  struck amount; every other status has a solid border.
- **Never render a confidence percentage.** Confidence is a server-side routing
  threshold. It does not reach the DOM.

## Ownership

See `docs/OWNERSHIP.md`. Stay inside your paths; `packages/shared` changes need a
heads-up before pushing because everything downstream compiles against them.
