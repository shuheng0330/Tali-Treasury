# Hosted Demo Team Seed Design

## Goal

Make all three Tali Treasury teammates active members of the hosted demo event
without rewriting migration history or deleting any existing event members.

The completed hosted membership mapping is:

| Display name | Wallet address |
| --- | --- |
| Shu Heng | `0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9` |
| Lim Wey Cheng | `0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471` |
| Kian Xiang | `0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e` |

## Existing state

Hosted Supabase project `mnoalwykrmueimmuyllw` already records migration
`20260831000000_seed_demo_event.sql`. A read-only verification on 31 August
2026 confirmed that it created event
`ba7e50e2-7e7b-4a67-a505-9e3a329739ae` and added Kian Xiang as its only active
member.

The corresponding commit, `8f9b412`, exists on `origin/Shuheng` but is not yet
an ancestor of `origin/main`. The implementation branch therefore starts from
`origin/Shuheng` so the repository contains the exact migration already recorded
by the hosted database.

## Chosen approach

Add a second migration,
`20260831010000_add_demo_team_members.sql`, rather than changing the applied
`20260831000000` migration.

The new migration inserts Shu Heng and Lim Wey Cheng into
`public.event_members` for the existing demo event. Each row uses
`on conflict (event_id, wallet_address) do update` to restore the confirmed
display name and set `active = true`. Kian Xiang remains owned by the original
seed migration.

The migration does not:

- modify the event, mandate, treasurer, dates, or allowed categories;
- delete or deactivate any member;
- insert claims or receipt objects;
- change roles, policies, secrets, or storage settings.

This additive approach preserves migration immutability, is safe to rerun
through a database reset, and prevents manual hosted data from drifting away
from the repository.

## Repository integration

The pull request contains both the existing seed commit and the new additive
migration. It targets `main` from `codex/seed-all-demo-members`.

Project documentation will state that the hosted demo event has all three active
team members. `PROJECT_REQUIREMENTS.md`, `ARCHITECTURE_AND_CODING_DESIGN.md`, and
`PROJECT_STATUS.md` will be checked and updated where the deployed seed changes
scope, deployment history, or next steps. `README.md` and `docs/PROGRESS.md` will
also remain consistent with the mandatory project documents.

## Verification

The database test suite will apply both migrations to a clean database. New
pgTAP assertions will verify that:

- all three confirmed wallet addresses exist for the fixed demo event;
- every confirmed member is active;
- every confirmed display name matches its wallet address;
- the demo event still references the official USDC mandate and treasurer.

Before hosted deployment, the Supabase CLI must show that local and remote
migration `20260831000000` match and that only
`20260831010000_add_demo_team_members.sql` is pending. The new migration is
applied without seeds, role files, or vault changes.

After deployment, verification must confirm:

- local and remote migration histories match through `20260831010000`;
- a second push dry-run reports the database is up to date;
- the three exact name-to-wallet mappings are active in the hosted event;
- the original event configuration is unchanged;
- public-schema linting reports no errors.

Application tests and TypeScript checks will also run to guard against unrelated
repository regressions. No private key, Supabase token, or service-role key may
appear in commands, logs, migrations, tests, or documentation.

## Failure handling

If hosted migration history no longer matches the preflight state, deployment
stops before any write and the divergence is investigated. If the additive
migration fails, no migration-history repair or manual SQL workaround is used.
The cause is fixed in a new migration or in the unapplied additive migration,
depending on whether Supabase recorded it.

## Definition of done

This increment is complete when:

- the repository contains the already-applied original seed migration and the
  new additive team-membership migration;
- local database tests, application tests, type checks, and schema lint pass;
- the integration pull request is merged into `main`;
- hosted migration history includes `20260831010000`;
- the hosted demo event contains all three confirmed active members;
- repository status and deployment documentation record the verified result.
