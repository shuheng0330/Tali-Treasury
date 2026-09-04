# Pitch deck

Six slides for a three-minute slot. The demo is the pitch — these bookend it and
carry nothing the live app already shows. Slide text is what goes on the slide;
notes are what you say. Timings match the scripts in
[SUBMISSION.md](SUBMISSION.md).

Build them in whatever tool you like. Keep the app open in another window and
switch to it at slide 3; do not screenshot the product into the deck.

---

## 1 — Title · 0:00–0:10

> **Tali**
> Wages and EPF leave together. Or neither of them moves.
>
> Sui Testnet · MUBA 2026

**Notes:** Say the subtitle out loud. It is the whole argument and it takes four
seconds.

---

## 2 — The problem · 0:10–0:25

> **The salary lands. The EPF doesn't.**
>
> Nobody finds out for months.

**Notes:** Unpaid statutory contributions are the quietest way a Malaysian
payroll goes wrong, because the failure is silent and the money is already gone
by the time it surfaces. Payroll software records the obligation. It does not
enforce it — because it answers to the employer.

Do not put a statistic here you cannot source under questioning.

---

## 3 — The mechanism · 0:25–0:40

> **One transaction. Four payments.**
>
> Worker · EPF · SOCSO · EIS
>
> Short any one of them → the whole run reverts.

**Notes:** The rules are fixed when the mandate is funded: which wallet may be
paid, a floor for each statutory body, a minimum share the worker keeps. Then
switch to the app.

---

## 4 — Live demo · 0:40–2:25

**No slide. Switch to the app.** Follow script A or B from
[SUBMISSION.md](SUBMISSION.md) depending on whether payroll is published on the
day. Decide which before you walk up; do not choose live.

Leave this slide in the deck as a black frame so a mis-click does not reveal the
closing slide early.

---

## 5 — What is actually on chain · 2:25–2:45

> **Three transactions. One allowed, two refused.**
>
> `Aksj8w…` paid 3 USDC to an approved member
> `5fMDNz…` asked for 15 against a 5 cap → **abort 5**
> `2htVB5…` paid an address not on the list → **abort 7**
>
> Signed with a valid capability. Refused anyway.

**Notes:** This is the slide that answers "your app could just be pretending".
The agent held a real capability both times. The contract refused, burned
0.002095 SUI doing it, and moved no USDC. Every digest opens in a public
explorer.

Payroll code is now published in package v2. Until the funded mandate and execution
evidence exist, say that boundary plainly here rather than being asked.

---

## 6 — Close · 2:45–3:00

> **Enforcement that survives the employer.**
>
> tali-treasury.vercel.app

**Notes:** Payroll software answers to whoever runs it. A funded mandate with
immutable rules can refuse the person who created it, and anyone can verify the
refusal without our cooperation. That is the part that needed a chain.

---

## Making it

- **Light background.** Every other team will project dark; a white deck reads
  better on a washed-out projector and matches the app.
- **One accent, purple `#7c3aed`**, same as the product. Purple for emphasis,
  amber only if you are marking something as a caveat.
- **No screenshots of the app.** You are about to show the real thing.
- **Digests in monospace**, truncated as above. Nobody reads 44 characters.
- **Test on the projector**, not just the laptop. Thin type and low-contrast
  grey are the two things that disappear.

## Before you present

- Decide script A or B and put the choice in the group chat.
- Open the app, the explorer tab and the deck in advance; do not sign in on stage.
- Have the four digests in a text file you can paste from if the room's network
  drops the explorer.
