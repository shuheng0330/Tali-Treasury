# Design rules

Binding for anything with a UI. Tokens live in `packages/web/src/app/globals.css`. If
you need a value that isn't there, add it to the `@theme` block — never inline a hex.

## Hard rules

1. **No gradients.** Not on buttons, not on backgrounds, not on text.
2. **No shadows** except `shadow-float`, and only on popovers and modals. Depth comes
   from the surface ladder (`canvas` → `surface` → `raised` → `sunken`) plus 1px
   hairlines in `rule`.
3. **Radius caps at `rounded-card` (8px).** Controls 5px, badges 3px.
4. **One accent.** `accent` is the only chromatic action colour. `ok` / `wait` / `no` /
   `dead` are status only and never appear on a button.
5. **Tabular figures on every number.** Use `.tnum`. The unit is smaller and lighter
   than the value.
6. **Status never relies on colour alone.** Every chip carries a glyph shape and a text
   label, so it survives greyscale and a bad projector.
7. **Ship the hover, `focus-visible`, empty and loading states.** Missing states is what
   separates a mockup from a product, and judges click things.

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

- Nothing below 18px above the fold. Hero headline `text-hero` (72px).
- No mid-greys on white — they vanish. `ink-3` is the lightest text allowed and never
  carries anything load-bearing.
- **Hover does not exist.** No hover-reveals, no tooltips holding information.
- No autoplay video. CSS and SVG animation only.
- One animated element per view. Only the in-progress state animates; terminal states
  are static.

## Typeface

Instrument Sans for UI, IBM Plex Mono for numbers, hashes, addresses and rule names.
Both on Google Fonts, both OFL. Deliberately not Inter or Geist.

Tracking tightens as type grows and the scale already encodes it. Don't override
`letter-spacing` by hand.
