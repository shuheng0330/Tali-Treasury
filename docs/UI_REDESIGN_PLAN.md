# UI redesign plan — minimalist pass

**Written 30 Aug 2026. For execution across several sessions, one phase at a time.**

Read this whole file before touching anything. Each phase is self-contained, ends
with a working app, and has acceptance criteria you must check before moving on.
Do **not** attempt more than one phase per session.

---

## 0. Facts you need before starting

**Repo:** `C:\Users\kianx\OneDrive\Documents\MUBA Hack\Tali-Treasury`
**Branch:** `Xiang-UI` (push here; never force-push)

**Commands** — all from the repo root:

| Purpose | Command |
|---|---|
| Dev server | `npm run dev` → http://localhost:3000 |
| Production build | `npm run build` |
| Typecheck | `npm run typecheck --workspaces --if-present` |
| Tests | `npm run test --workspaces --if-present` (83 must pass: 14 + 69) |

`npm run dev` and `npm run build` first build `@tali/treasury-sui` and
`@tali/shared`, which the web app imports as compiled `dist/`. **If you edit
anything under `packages/shared/src` or `packages/sui-integration/src`, you must
rebuild before the web app sees it.** Running the root script does this for you.

**Stack:** Next.js 16.3.3 (App Router, Turbopack), React 19, Tailwind CSS v4.

**Tailwind v4 is CSS-first. There is no `tailwind.config.js` and you must not
create one.** All design tokens live in `packages/web/src/app/globals.css` inside
the `@theme inline { ... }` block. Colours are defined as raw RGB channel triplets
on `:root` (e.g. `--ink: 16 21 26;`) and mapped in `@theme inline` as
`--color-ink: rgb(var(--ink));`. Three colour blocks must stay in sync: `:root`
(light), the `@media (prefers-color-scheme: dark)` block, and
`:root[data-theme='dark']`.

**Windows note:** stop the dev server by finding its PID with
`netstat -ano | grep ":3000"` then `taskkill //PID <pid> //F`. Killing the shell
alone orphans `node.exe`, and orphaned servers corrupt `.next`.

### Files this plan touches

Landing page (the focus):
- `packages/web/src/app/page.tsx`
- `packages/web/src/components/landing/Wire.tsx`
- `packages/web/src/components/landing/Evidence.tsx`
- `packages/web/src/components/landing/PhoneCode.tsx` — context only; **no phase
  in this plan changes it.** Its QR needs a 4-module quiet zone and a white
  background in both themes, both already correct. Leave it alone.

Shared design layer (changing this affects **every** screen):
- `packages/web/src/app/globals.css`
- `packages/web/src/components/Money.tsx`
- `packages/web/src/components/StatusChip.tsx`
- `packages/web/src/components/BudgetMeter.tsx`

Other screens that consume the tokens — check these after any token change:
- `/claim` → `components/claim/*`
- `/treasury` → `components/treasury/*`
- `/safety` → `components/safety/SafetyTest.tsx`, `AttackResult.tsx`
- `/system` → `app/(app)/system/page.tsx`

### Hard rules — do not break these

1. **No AI attribution anywhere.** No `Co-Authored-By`, no "Generated with", no
   robot emoji, no session links in commits, PRs or code comments. See
   `CLAUDE.md`. Verify before pushing:
   `git log --format='%an%n%ae%n%B' origin/main..HEAD | grep -iE 'claude|anthropic|co-authored|generated with'`
2. **Never invent a transaction digest, gas figure, latency or checkpoint.** Every
   digest on the site comes from `taliUsdcDemo` in
   `packages/sui-integration/src/demo.ts` and is real. The Wire is explicitly
   labelled "Illustration — not a live transaction". Keep that label, keep it
   legible, and do not add fake evidence back.
3. **Do not change any stated contract fact** — abort codes, the "seven checks
   inside `spend()`", the gate order, or the rule labels — without re-reading
   `contracts/tali_treasury/sources/tali_treasury.move`. These were verified line
   by line and are correct.
4. **Never render a confidence percentage.** See `docs/DESIGN.md`.
5. **Amounts stay in USDC**, 6 decimals, via `toDisplay` from `@tali/shared`.
   Never format money with floats.
6. This is a **visual** pass. Do not change copy meaning, remove sections, or
   alter what the page claims. Trimming wordiness is allowed where a phase says so.

---

## 1. Diagnosis — why it currently looks messy

Measured, not guessed.

### The root cause: the type scale has collapsed

The `main` branch raised the small type tokens, apparently to satisfy the
"nothing below 18px" projection rule in `docs/DESIGN.md` line 50. That rule is
about *what sits above the fold*; it was applied to the *token definitions*
instead, and the merge into `Xiang-UI` took main's values.

Verified with `git show`:

| Token | `Xiang-UI` before merge (`a17c216`) | `main` (`3e3bd12`), and now HEAD |
|---|---|---|
| `--text-label` | 11px | **18px** |
| `--text-caption` | 12.5px | **18px** |
| `--text-body` | 14px | **18px** |
| `--text-subhead` | 16px | **20px** |
| `--text-heading` | 20px | 20px |

Current state in `globals.css`:

| Token | Now | Intended role |
|---|---|---|
| `--text-label` | **18px**, uppercase, 0.12em tracking | tiny eyebrow / metadata |
| `--text-caption` | **18px** | secondary text |
| `--text-body` | **18px** | primary text |
| `--text-subhead` | **20px** | lead-in |
| `--text-heading` | **20px** | section heading |

Five distinct steps became two values. `label`, `caption` and `body` are
identical, so metadata shouts as loudly as content, and 18px uppercase text with
0.12em tracking is enormous — every "ORIENTATION WEEK MANDATE", "QUEUE",
"NETWORK" and "CLAIM Q-0148" is now a headline. **Nothing recedes, so everything
competes.** This single regression explains most of the "messy" feeling and must
be fixed first.

### Secondary problem: the page is a stack of boxes

Structural border declarations on the landing page (counting only utilities that
actually draw a line — `border-rule` is a *colour*, not a border):

| File | `border-t/b/y/l` | `divide-y` | Rendered horizontal lines |
|---|---|---|---|
| `Wire.tsx` | 5 | 1 | **8** |
| `page.tsx` | 5 | 0 | 4 (plus one left rule) |
| `Evidence.tsx` | 1 | 1 | 3 |

Inside the Wire card those five declarations render as eight horizontal rules,
because the `divide-y` on a four-item list draws three of them: header
(`:183`), rule list top (`:287`), three dividers between rules, verdict
(`:331`), queue (`:354`), footnote (`:381`). Research
consensus is blunt about this: putting a border around every row makes the
interface read as a spreadsheet, and users spend attention processing lines
instead of content. NN/g's guidance is to ask whether a boundary is *necessary*
to understand the grouping, or whether whitespace can carry it.

### Third problem: spacing is ad-hoc

The landing files use `px-5`, `px-4`, `py-3`, `py-4`, `py-1`, `px-2.5`, `pt-5`,
`pb-7`, `pt-8`, `gap-0.5`, `gap-1`, `gap-2`, `gap-3`, `gap-4`, `gap-5` — fifteen
different values with no system. The accepted approach is a 4px scale
(4/8/16/24/32/48/64) with one padding value per container role, and the gap
*between* groups visibly larger than the gap *inside* them.

### Fourth problem: too many colours competing

Five semantic hues (`accent`, `ok`, `wait`, `no`, `dead`), each with `-soft` and
`-line` variants. The products this should resemble — Linear, Vercel, Stripe —
run almost entirely greyscale with **one** accent doing the work. Our status
colours are genuinely load-bearing on `/treasury` and `/safety`, but the landing
page does not need all of them.

---

## Phase A — restore the type scale

**Goal:** give the page a real hierarchy again. This is the highest-impact change
in the plan and it is mostly one file.

### A1. Edit `packages/web/src/app/globals.css`

Inside `@theme inline`, replace the five collapsed steps with this scale. Keep
`--text-title`, `--text-display` and `--text-hero` exactly as they are.

```css
--text-label: 12px;
--text-label--line-height: 16px;
--text-label--letter-spacing: 0.08em;
--text-label--font-weight: 500;

--text-caption: 14px;
--text-caption--line-height: 20px;

--text-body: 16px;
--text-body--line-height: 26px;
--text-body--letter-spacing: -0.003em;

--text-subhead: 18px;
--text-subhead--line-height: 26px;
--text-subhead--letter-spacing: -0.008em;
--text-subhead--font-weight: 500;

--text-heading: 24px;
--text-heading--line-height: 30px;
--text-heading--letter-spacing: -0.018em;
--text-heading--font-weight: 600;
```

Rationale, so you can defend each number:
- **body 16px / 26px** is a 1.625 line-height, inside the 1.5–1.75 band that
  readability guidance recommends, and 16px is the accepted floor for body text.
- **caption 14px** sits one clear step below body.
- **label 12px** with tracking reduced from 0.12em to 0.08em — 0.12em was tuned
  for 11px and is too loose at 12px.
- **heading 24px** separates section headings from `subhead` (18px), which they
  previously did not.

### A2. Protect the projection rule properly

`docs/DESIGN.md` says nothing below 18px above the fold. Satisfy it in *usage*,
not in the tokens: in `app/page.tsx`, the hero block must use only `text-hero`,
`text-display`, `text-subhead` (18px) or explicit `text-[18px]`. The hero already
uses `text-[16px] md:text-[19px]` for its paragraph — change that to
`text-subhead md:text-[19px]`.

Two other elements sit above the fold at 16px and also breach the rule, at
`page.tsx:49` (the problem sentence) and `page.tsx:69` (the fact line). **Phase D
removes both** — it merges the problem sentence into the subhead and moves the
fact line to the footer. If you are stopping after Phase A, raise them to
`text-subhead` as an interim fix; if you are going on to Phase D, leave them.

### A3. Sweep every screen

The token change affects the whole app. Start the dev server and look at all five
routes at 1440px wide and at 390px wide: `/`, `/claim`, `/treasury`, `/safety`,
`/system`.

You are looking for text that is now *too small to read* — places that relied on
the accidental 18px. Fix those at the call site by moving up one step (e.g.
`text-caption` → `text-body`), **never** by changing the token back.

### Acceptance criteria

- [ ] `npm run build` compiles; `npm run typecheck --workspaces --if-present`
      reports zero errors; 83 tests still pass.
- [ ] All five routes return 200.
- [ ] On `/`, the eyebrow "CLUB AND EVENT TREASURY · SUI TESTNET" is visibly
      smaller than the body paragraph beneath it.
- [ ] In the Wire card, "ORIENTATION WEEK MANDATE" is visibly smaller than the
      merchant name.
- [ ] No horizontal scrollbar at 390px on any route.
- [ ] Commit message describes the regression and the fix. No AI attribution.

**Stop here. Do not start Phase B in the same session.**

---

## Phase B — remove the boxes

**Goal:** cut border count on the landing page by at least half, replacing lines
with space and one background tint. Order of preference: proximity first,
background tint second, borders only for genuinely hard edges.

### B1. `Wire.tsx` — the worst offender

Keep exactly two borders:
1. the outer card border, and
2. **one** divider above the verdict line.

The verdict is the payoff and earns a hard edge. Everything else becomes spacing.

- Remove `border-b` from the card header. Separate it with padding instead.
- Remove `divide-y divide-rule` from the rule list `<ul>`. Give each `<li>`
  vertical padding of 8px and rely on alignment. The four rules already read as a
  set because they are numbered and left-aligned.
- Remove `border-t` from the queue row and the footnote. Increase the space above
  each instead.
- **Keep** the `bg-no-soft` tint on the failed rule row. That is a background
  tint doing grouping work, which is exactly the recommended middle option, and it
  is the one row that must stand out.

### B2. `Evidence.tsx`

- Remove `divide-y divide-rule` from the list. Separate the three runs with 24px
  of space.
- Keep the outer card border and the single `border-t` above the aftermath
  paragraph.

### B3. `page.tsx`

- Remove `border-y border-rule` from the objection section. Keep only its
  `bg-surface` tint — the tint alone already creates the region.
- Keep the `border-t` above the fact line (`:69`) and above the footer (`:177`),
  and the `border-b` under the page header (`:15`). Those separate genuinely
  different kinds of content.
- Keep the `border-l-2` on the objection blockquote (`:107`). A single left rule
  on a pull-quote is a typographic device, not chrome.

There is **no three-card "ways in" grid** — it was already replaced by an inline
sentence ("Look around as a member, as the treasurer, or …") at `page.tsx:158`.
Do not go looking for it, and do not reinstate it.

### Acceptance criteria

- [ ] From `packages/web/src`:
      `grep -coE 'border-(t|b|y|l|r)' components/landing/Wire.tsx` returns **2 or
      fewer** (down from 5), and `grep -c 'divide-y' components/landing/Wire.tsx`
      returns **0** (down from 1). Note the `` — without it the pattern also
      matches `border-rule`, which draws nothing.
- [ ] Rendered horizontal lines inside the Wire card drop from 8 to at most 2.
- [ ] Every group is still visually distinct — take a screenshot at 1440px and
      confirm you can tell where each section begins without lines.
- [ ] Build, typecheck, tests, five routes green. No 390px overflow.

---

## Phase C — put spacing on a system

**Goal:** every spacing value comes from `4, 8, 16, 24, 32, 48, 64`, and one
padding value per container role.

### C1. Container roles

| Role | Padding | Tailwind |
|---|---|---|
| Small controls (chips, buttons) | 8/16px | `px-4 py-2` |
| Cards (Wire, Evidence) | 24px | `p-6` |
| Page sections | 32–48px vertical | `py-8` / `py-12` |
| Hero region | 64–96px vertical | `py-16` / `md:py-24` |

Replace `px-4 sm:px-5` on cards with a single `p-6`. Replace `pb-7 pt-8` on the
rail with `py-8`.

### C2. The grouping ratio

**The gap between groups must be visibly larger than the gap inside them.** Inside
a group use 8px (`gap-2`); between groups use 24px (`gap-6`) or more. Delete every
`gap-0.5`, `gap-1`, `gap-3`, `gap-5` and `px-2.5` on the landing page and snap to
the scale.

### C3. Section rhythm

All top-level `<section>` elements on `page.tsx` get the same vertical rhythm:
`py-12 md:py-20`. Currently they vary between `py-14`, `pb-16` and `pb-12`.

### Acceptance criteria

- [ ] No `gap-0.5`, `gap-1.5`, `gap-2.5`, `gap-3`, `gap-5`, `gap-7`, `px-2.5`,
      `pt-5`, `pb-7` remain in `components/landing/*` or `app/page.tsx`.
      Verify: `grep -nE '\b(p|px|py|pt|pb|gap|gap-x|gap-y)-(0\.5|1\.5|2\.5|3|5|7)\b' components/landing/*.tsx app/page.tsx`
      returns nothing.
- [ ] Build, typecheck, tests, five routes green. No 390px overflow.

---

## Phase D — the minimalist hero

**Only start this after A, B and C are merged.** This is the section the user
specifically asked for.

### D1. Cut the hero to four blocks

It currently has six: eyebrow, H1, a four-line paragraph, a separate two-line
problem paragraph, CTAs, and a fact line. Reduce to:

1. **Eyebrow** — `text-label`, uppercase, `text-ink-3`.
2. **H1** — `text-display md:text-hero`, unchanged wording, `max-w-4xl`.
3. **One sentence**, `text-subhead md:text-[22px]`, `max-w-[60ch]`. Merge the
   current subhead and problem paragraph into a single sentence of at most 30
   words. Keep the meaning: an agent reimburses members, and the limits live in a
   contract rather than in our backend.
4. **One primary CTA** ("Try to break it") plus one text link ("or submit a
   claim"). Already correct — do not add a third.

**Move the fact line** ("Live on Sui testnet · package … · seven checks …") out of
the hero and into the footer, where it belongs with the other provenance.

### D2. Give it air

Hero section padding becomes `py-24 md:py-32`. The generous space around a
headline is what makes it read as deliberate rather than cramped; this is the
single most reliable minimalist move.

### D3. One accent, not five

On the landing page only, restrict colour to greyscale plus `accent`, with `no`
(red) reserved **exclusively** for the refusal state in the Wire and the "Refused"
badges in Evidence. Specifically:
- The "Illustration — not a live transaction" label is currently `text-wait`
  (amber). Change to `text-ink-3` with `font-medium`. It must stay legible —
  do not shrink it below `text-caption`.
- The "Allowed" badge in `Evidence.tsx` may keep `ok` green.

Do not touch the colour system on `/treasury` or `/safety`, where the status
colours carry meaning.

### D4. Do not centre anything

The page is left-aligned on a consistent left edge and must stay that way. A
single strong left margin is what makes editorial layouts feel composed.

### Acceptance criteria

- [ ] Hero contains exactly four blocks.
- [ ] Hero paragraph is one sentence, ≤30 words, ≤60 characters per line.
- [ ] At 1440×900 with the browser at default zoom, the H1, the sentence and both
      CTAs are all above the fold.
- [ ] The only non-greyscale colours on the landing page are `accent`, the red
      refusal state, and the green "Allowed" badge.
- [ ] Build, typecheck, tests, five routes green. No 390px overflow.

---

## Phase E — verification and polish

### E1. Check it in a real browser at real sizes

Take screenshots at 1440×900 and 390×844. Chrome is at
`C:\Program Files\Google\Chrome\Application\chrome.exe`. Install
`puppeteer-core` in a scratch folder **outside the repo** (never add it to the
project's dependencies) and drive that Chrome with `executablePath`.

Do **not** use `chrome --headless --screenshot --window-size` to judge layout — it
does not set the device viewport and produces misleading crops. Use Puppeteer's
`page.setViewport()`.

Check for horizontal overflow programmatically rather than by eye:

```js
await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
```

### E2. Dark mode

Nobody has ever looked at dark mode. Set `data-theme="dark"` on `<html>` in
devtools and check all five routes. The tokens exist and their contrast was fixed,
but the result is unverified.

### E3. Accessibility regressions

Phases B and C move a lot of markup. Confirm these still hold:
- Every interactive element is reachable by Tab and shows a focus ring.
- The Wire's Pause button still works and still has
  `aria-label="Pause the demonstration"`.
- Each rule row still has its `sr-only` state word ("Failed." / "Passed." /
  "Not reached." / "Not checked yet.").
- `:focus-visible` in `globals.css` must **not** regain a `border-radius` — it is
  unlayered and would override every `rounded-*` utility.

### Acceptance criteria

- [ ] Screenshots at both sizes reviewed.
- [ ] Dark mode checked on all five routes.
- [ ] Keyboard pass done.
- [ ] `npm run build`, typecheck, and 83 tests green.

---

## Sequencing

| Phase | What | Depends on | Rough size |
|---|---|---|---|
| A | Restore type scale | — | small, high impact |
| B | Remove boxes | A | medium |
| C | Spacing system | B | medium |
| D | Minimalist hero | A, B, C | medium |
| E | Verification | D | small |

A is worth doing on its own even if nothing else happens — it fixes the regression
that caused the complaint.

## Out of scope

Do not, in this plan: change the copy's meaning, add animation, add a font, add a
UI library, introduce dark-mode-only designs, touch the Move contract, touch the
API routes under `app/api`, or change `mock/` data values. Those numbers now
mirror the live on-chain mandate and must not drift.

## Sources

- [NN/g — The Principle of Common Region](https://www.nngroup.com/articles/common-region/)
- [The Five Spacing Decisions That Fix Most UI](https://blakecrosley.com/blog/five-spacing-decisions)
- [Swiss design principles for web designers](https://swissthemes.design/insights/swiss-design-for-web-designers)
- [Four design principles behind Stripe, Linear and Vercel](https://www.pixeldarts.com/en/post/four-design-principles-behind-stripe-linear-and-vercel)
- [Stunning hero sections for 2026: layouts and patterns](https://lexingtonthemes.com/blog/stunning-hero-sections-2026)
- [Applying white space in UI design](https://uxdesign.cc/whitespace-in-ui-design-44e332c8e4a)
