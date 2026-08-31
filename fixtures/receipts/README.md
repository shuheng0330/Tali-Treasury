# Receipt fixtures

Images used to exercise the analyzer end to end against a real Gemini call. Two
sets, kept apart because they are evidence of different things.

## Real photographs (public domain)

Genuine receipts, so they prove the analyzer copes with creased paper, faded
thermal ink and a scan that is not square. All three are public domain and may
appear in a demo video without an attribution overlay.

| File | Merchant | Date | Total | Source |
| --- | --- | --- | --- | --- |
| `save-mart-groceries-2010.jpg` | Save Mart Supermarkets | 10/23/10 | USD 3.99 | [Commons](https://commons.wikimedia.org/wiki/File:Save_Mart_recipt_2010-10-23.jpg) |
| `shell-fuel-mastercard.jpg` | Shell, Midland MI | 06/21/06 | USD 20.00 | [Commons](https://commons.wikimedia.org/wiki/File:Shell-Gas-Station-Receipt-MasterCard.jpg) |
| `tesco-groceries-1994.jpg` | Tesco, Finchley branch | 19/04/94 | GBP 6.71 | [Commons](https://commons.wikimedia.org/wiki/File:Tesco_grocery_receipt_Finchley_1994.jpg) |

Each fails differently, which is why all three are kept:

- **Save Mart** is the easy case: clean scan, one line item, unambiguous `MM/DD/YY`.
- **Shell** has a round total because the driver bought exactly twenty dollars of
  fuel, so `6.736 gallons x $2.969` does not reconcile to it. Anything that
  recomputes a total from line items gets this wrong.
- **Tesco** is adversarial: 1994 thermal print faded to low contrast, pounds rather
  than dollars, and `19/04/94`, which is only readable as `DD/MM/YY` because there
  is no nineteenth month.

## Generated Malaysian receipts

No freely licensed photograph of a Malaysian receipt appears to exist — neither
Wikimedia Commons nor Openverse has one — and stock imagery cannot be committed
here. These four are therefore **generated, not photographed**. The merchants are
invented so that nothing in this folder resembles a record of a real business's
real transaction; the layout, SST line, five-sen rounding and Malay wording follow
local convention.

| File | Merchant | Date | Total | Exercises |
| --- | --- | --- | --- | --- |
| `my-kedai-runcit-4.20.jpg` | Kedai Runcit Sri Murni | 14/08/2026 | RM 4.20 | auto-pay, under the per-claim limit |
| `my-pasar-mini-3.85.jpg` | Pasar Mini Harapan | 27/08/2026 | RM 3.85 | auto-pay, under the per-claim limit |
| `my-kopitiam-13.35.jpg` | Kopitiam Seri Bakti | 22/08/2026 | RM 13.35 | held, over the RM 5.00 per-claim limit |
| `my-medan-selera-88.00.jpg` | Medan Selera Bistari | 29/08/2026 | RM 88.00 | held, and over the remaining budget too |

The two amounts either side of RM 5.00 are deliberate: the demo mandate caps a
single claim at 5.00, so this set walks both branches of the policy engine without
needing the mandate changed.

`my-kopitiam-13.35.jpg` is the one worth keeping if the set is ever trimmed. It
carries a subtotal of 12.60, SST of 0.76 and a rounding adjustment of -0.01, so a
reader that grabs the first or largest number on the page returns 12.60 and is
wrong; only one that finds `JUMLAH` returns 13.35.

## Expected values

Every total above is what a person reads off the image. They are the expected
answer, not a transcript of what the model returned.
