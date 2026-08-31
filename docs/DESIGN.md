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
4. **One accent, and it is a fill before it is a colour.** `accent` (#ff7a00) is the
   only chromatic brand colour. It is never text: at 2.6:1 on white it fails at every
   size. Orange text uses `accent-ink`, orange fills carry `on-accent` (a fixed dark
   that does not flip with the theme, because the fill doesn't either).
5. **Primary action is ink, not accent.** The default button is `btn--primary`, a dark
   pill. `btn--accent` is for the one action a screen is actually about — the safety
   test's trigger, the landing's first call. Two orange buttons in a viewport means one
   of them is wrong.
6. **`ok` / `no` / `dead` are status only** and never appear on a button. `wait` is an
   alias of the accent ramp: "needs attention" and "the brand" are the same warm hue on
   purpose, so the palette carries four meanings, not five.
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
  way to reach a fact. The role cards flood orange on hover and say the same words
  either way.
- No autoplay video. CSS and SVG animation only.
- One animated element per view. Only the in-progress state animates; terminal states
  are static.

## Typeface

**Bricolage Grotesque** for display: headings, the tracked uppercase labels, and any
figure meant to be read across a room. **Albert Sans** for reading. **IBM Plex Mono**
for numbers, hashes, addresses and rule names. All three on Google Fonts, all three OFL.

Two uppercase sizes carry the labelling — `text-label` (12px) and `text-control` (14px)
— and both track at exactly 0.15em. Everything above body size tracks negative, and the
scale already encodes it. Don't override `letter-spacing` by hand.
