# Design rules

Binding for anything with a UI. Tokens live in `packages/web/src/app/globals.css`. If
you need a value that isn't there, add it to the `@theme` block — never inline a hex.

## Hard rules

1. **No gradients on anything that carries content.** Not on buttons, not on text, not
   on a panel behind reading matter. The one permitted use is an edge fade on a
   deliberately clipped decorative strip — currently just the check marquee — where the
   gradient exists to show the strip continues past the viewport.
2. **No shadows** except `shadow-float`, and only on popovers and modals. Depth comes
   from the surface ladder (`canvas` → `surface` → `raised` → `sunken`) plus 1px
   hairlines in `rule`.
3. **Radius is a ladder, and each rung means something.** `control` (10px) for inputs
   and anything you type into. `card` (16px) for a group of related rows. `panel`
   (28px) for a whole section. `modal` (24px) for dialogs. `badge` (pill) for chips,
   tabs and buttons. A pill is always interactive; a rectangle never is.
4. **One accent, and it is a fill before it is a colour.** `accent` (#7c3aed) is the
   only chromatic brand colour, and it is never text. Accent text uses `accent-ink`
   (#6d28d9, 7.10:1 on canvas and 6.48:1 on `accent-soft`); accent fills carry
   `on-accent`, which is white at 5.70:1. Near-black on the fill measures 3.43:1 and
   fails, which is the opposite of what the orange ramp needed.
5. **Primary action is ink, not accent.** The default button is `btn--primary`, a dark
   pill. `btn--accent` is for the one action a screen is actually about — the safety
   test's trigger, the landing's first call. Two accent buttons in a viewport means one
   of them is wrong.
6. **`ok` / `no` / `dead` / `wait` are status only** and never appear on a button.
   `wait` was once an alias of the accent ramp, on the grounds that "needs attention"
   and "the brand" were the same warm hue. The brand is purple now, so that coupling
   would have made warnings purple — and amber is the one status colour a reader
   already knows without being told. `wait` keeps the amber ramp and the palette
   carries five meanings, deliberately.
7. **Tabular figures on every number.** Use `.tnum`. The unit is smaller and lighter
   than the value.
8. **Status never relies on colour alone.** Every chip carries a glyph shape and a text
   label, so it survives greyscale and a bad projector.
9. **Ship the hover, `focus-visible`, empty, loading and disabled states.** Disabled is
   not opacity: a 40% ink pill lands on mid-grey and drops its label to 2.5:1, and
   "Cannot approve" is information. `.btn:disabled` repaints to `raised` / `ink-3`.
10. **Every colour pair is measured, not eyeballed.** Body text clears 4.5:1 on every
    surface it can land on. Check before you add a token, not after a judge squints.

## Revoked is not rejected

The distinction the product exists to make.

**Rejected** is a human declining a claim — `no` palette, solid border, normal amount.
**Revoked** is a granted on-chain permission being pulled — `dead` palette, **dashed
border**, **struck amount**. Every other status has a solid border, so dashed reads as
"this authority was withdrawn" without depending on colour.

Never paint them the same.

## Never render a confidence percentage

No product in expense management exposes one — not Expensify, Ramp, Pleo, Brex, Concur,
Xero, QuickBooks, Wise or Revolut. A percentage invites the user to argue with a number
they cannot evaluate and makes the system read as less reliable than saying nothing.

Assert the extraction as fact. Every field is one tap from editable. Highlight only the
fields we are unsure about. When extraction fails, a flat sentence and empty fields:
*"Couldn't read this receipt. Enter the details manually."*

`ReceiptAnalysis.confidence` is a server-side routing threshold. It does not reach the
DOM.

## Projection

The demo runs on a projector, 3–8m away, in a lit room.

- Nothing below 18px above the fold. Hero headline `text-hero`, which clamps between
  40px and 88px so it fills the measure without orphaning a word.
- No mid-greys on white — they vanish. `ink-3` is the lightest text allowed and never
  carries anything load-bearing.
- **Hover holds nothing.** Hover may recolour, lift or slide; it may never be the only
  way to reach a fact. The role cards flood accent on hover and say the same words
  either way.
- No autoplay video. CSS and SVG animation only.
- One animated element per view. Only the in-progress state animates; terminal states
  are static.

## Mobile comprehension and evidence

- At 320–430px, one card has one reading path: identity and amount, status and
  reason, payout, then action. Claim cards are separated by 16px instead of
  relying on dividers inside one large panel.
- Put the answer before the proof. Calculations, Sui rules, FX metadata, and
  policy checks use native `details` disclosures with a 44px summary target.
- Show only the first actionable policy failure before expansion. Expanded
  checks are ordered failed, pending, then passed.
- Preserve six-decimal evidence inside disclosures and confirmation dialogs;
  concise cards may shorten labels but never round away payment precision.
- Use `Intl.DateTimeFormat` for human-facing timestamps. Raw ISO timestamps are
  transport evidence, not interface copy.
- Respect safe-area insets, prevent horizontal overflow, and make all operational
  buttons at least 44px high. Below 360px, claim actions stack to full width.

## Product language

- Write from the operator's point of view. Labels name the action or financial
  object, never the implementation stage: `Monthly gross wage`, `Salary stream`,
  and `Vesting period` replace development-only terminology.
- Keep one accurate network label at wallet, signing, transaction, and explorer
  boundaries. Do not repeat generic warnings on every card or page.
- Local fallback content is `Preview data`, never live data. State that live-only
  actions are unavailable instead of exposing backend or fixture terminology.
- Competition credits, rollout notes, and the design-system route do not belong
  in customer navigation. Verifiable contract and transaction evidence remains.

## Typeface

**Bricolage Grotesque** for display: headings, the tracked uppercase labels, and any
figure meant to be read across a room. **Albert Sans** for reading. **IBM Plex Mono**
for numbers, hashes, addresses and rule names. All three on Google Fonts, all three OFL.

Two uppercase sizes carry the labelling — `text-label` (12px) and `text-control` (14px)
— and both track at exactly 0.15em. Everything above body size tracks negative, and the
scale already encodes it. Don't override `letter-spacing` by hand.
