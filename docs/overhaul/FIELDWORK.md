# Design-Partner Gym — Fieldwork Kit

**Purpose:** settle the four questions that decide the product, using the cheapest, highest-quality
data we have — one real Indian gym — before any platform code is written.
**Why this exists:** the R1 completeness critic's sharpest finding was that all nine research areas
were desk research over Western sources, while a live design partner sat unobserved. Central product
bets currently rest on inference. One week of observation replaces guesswork with fact.

**Time needed:** ~1 week of visits (ideally including one **month-end/1st-of-month**, the busiest
renewal window, and one **6–9am peak**). Owner runs this; I turn the answers into the MVP spec.

---

## The four decisions this trip must settle

| # | Decision | Why it's expensive to get wrong |
|---|---|---|
| **D1** | **Phone-first or computer-first?** | Two completely different products. Desk research contradicted itself: global UX research says a dense keyboard-driven desktop console; India research says the owner's phone. Months of work ride on this. |
| **D2** | **What is the actual #1 daily mess?** | We assumed cash/UPI reconciliation. Nobody verified it. The first feature we build should be whatever genuinely wastes their time. |
| **D3** | **Do members even install gym apps?** | Our whole strategy rests on the member app. If members won't install it, the wedge collapses. |
| **D4** | **What would they pay — and what would they stop paying for?** | Decides whether ₹1,499/month is fantasy or leaves money on the table. |

---

## Part A — Watch, don't ask (highest-value hour of the week)

Sit at the front desk during a peak hour and a month-end day. Write down **what actually happens**,
not what anyone says happens.

- [ ] What device does the person at the desk touch? (Phone / shared PC / tablet / paper register / nothing)
- [ ] Is there a computer at all? Is it on? Who is logged into what?
- [ ] Time a member check-in. How does it happen — biometric, name shout, register signature, nothing?
- [ ] Count interruptions in one hour: how many are "I want to pay", "when does mine expire",
      "where's my trainer", "I want to join"?
- [ ] Watch one new member sign up end-to-end. **Time it.** What is written where? What is photographed?
- [ ] Watch one payment. Cash? UPI QR? Which app? Who records it, where, and when?
- [ ] What is stuck to the wall / lying on the desk? (Photograph it — registers, expiry charts,
      whiteboards, dues lists. This is the real product spec.)

## Part B — Owner interview

**Money & renewals (this is the core of the business)**
- [ ] Membership plans and prices? What % choose annual vs quarterly vs monthly?
- [ ] What discount for paying a year upfront?
- [ ] Roughly how many members? How many are currently **expired but not renewed**?
- [ ] How do you know whose membership expires this week? (Show me.)
- [ ] How many members owe you money right now — and how do you track part-payments?
- [ ] Cash vs UPI split, roughly? Which UPI apps? Does it land in a personal or business account?
- [ ] How do you match a UPI screenshot to a member? What goes wrong?
- [ ] What % renew? What happens on the day someone's membership expires — who contacts them, how?
- [ ] GST registered? Who makes the invoices? How long does that take each month?

**Operations & people**
- [ ] Who works here, what does each person do, and what are they allowed to see/change?
- [ ] How are trainers paid — salary, commission, both? What % of PT fees?
- [ ] How do you track PT sessions sold vs sessions actually delivered?
- [ ] Do you run group classes? How full are they?
- [ ] What do you do with the biometric/attendance machine data — ever look at it?

**Software today**
- [ ] What software do you use now (if any)? What do you pay? What do you hate about it?
- [ ] What did you try before and stop using — and why exactly?
- [ ] If you use Excel/register: can I have a copy/photo of the real file? (**Most valuable artifact
      of the whole trip.** It is the true data model.)

**Members & churn**
- [ ] Who quit in the last 3 months, and do you know why?
- [ ] Can you tell today which members are drifting away — before they quit?
- [ ] What do you do when you notice? Does it work?
- [ ] Do you use WhatsApp with members? Groups or individual? Do they reply or ignore?
- [ ] Has cult.fit or a chain affected you? How do you compete?

**Pricing (ask last, casually)**
- [ ] "If software fixed [their stated #1 pain], what would that be worth per month?"
- [ ] "What's the most you've ever paid for gym software?"
- [ ] "What would you cancel to pay for this?" ← *the real signal*

## Part C — Talk to the staff (do this without the owner present)

The receptionist/trainer will use the software far more than the owner. Owners describe the gym they
want; staff describe the gym that exists.

- [ ] What takes the longest in your day?
- [ ] What do you write down twice?
- [ ] What do members ask you that you can't answer immediately?
- [ ] What would you never use on a computer? Are you comfortable typing?

## Part D — Members (5–10 quick chats on the floor)

- [ ] Do you track your workouts? On what — app, notebook, memory, nothing?
- [ ] Which fitness apps do you have on your phone right now? (**Look, don't ask.**)
- [ ] Would you install an app from this gym? What would make it worth keeping?
- [ ] Phone model? (Entry-tier Android reality check — our app must run on what members actually own.)
- [ ] Do you know when your membership expires?

---

## Part E — Data to bring back

- [ ] Photo/copy of the member register or Excel file (**the real schema**)
- [ ] Photo of the expiry/dues tracking method
- [ ] A sample invoice/receipt
- [ ] Photos of the front desk setup and any wall charts
- [ ] Screenshot of their current software, if any
- [ ] Export from the biometric machine, if one exists — what fields does it actually give?

---

## How to answer the four decisions afterwards

- **D1** → answered by Part A device observation + Part C typing comfort.
- **D2** → answered by Part A interruption counts + Part B "what takes longest".
- **D3** → answered by Part D phone inspection (installed apps, device tier).
- **D4** → answered by Part B pricing questions + what they pay today.

**No need to write a report.** Photos, the register file, and rough notes are enough — I'll turn them
into the MVP spec, the data model, and the sprint plan.

---

## Executive Summary (Simple English)

- All our research so far came from the internet — mostly American websites.
- Your gym is the best research source we have, and we haven't used it.
- Spend about a week watching your gym instead of asking people about it — especially at month-end and during the morning rush.
- Four things must be settled: does the front desk use a phone or a computer · what actually wastes their time every day · will members really install an app · what would they genuinely pay.
- The single most valuable thing to bring back is a copy of their **member register or Excel file** — it shows exactly what the software must store.
- Also talk to the receptionist and trainers *without* the owner around. They'll tell you what really happens.
- Check what fitness apps members already have on their phones, and what phones they own — cheap Android phones are what our app must run on.
- Don't write a report. Photos and rough notes are enough; I'll turn them into the build plan.
