# ForgeAI Gym CRM — test checklist

Things to click through in a browser. The CRM is a web app, so there is no install step —
run `npm run dev --workspace apps/dashboard` and open the printed URL.

🔬 = an edge case a review found — worth an extra look.
Automated coverage lives in `apps/dashboard/test/crm/**` (`npm test --workspace apps/dashboard`);
this file is only for what a human has to look at.

> Builds: **P1** = roster spine (members, plans, sell/renew, dues, check-in).

---

## P1 — roster spine (untested by owner)

### First run
- [ ] A brand-new browser shows the **welcome screen**, not an empty dashboard.
- [ ] **"Create my gym"** is disabled until a name of 2+ characters is typed.
- [ ] Creating a gym lands on **Today** with zeroes everywhere and no members — nothing invented.
- [ ] 🔬 **"Explore a demo gym"** loads ~128 members. This must never happen on its own — a real
      owner must never find fake members in their roster.
- [ ] Refreshing the page keeps whatever you chose (it is saved in the browser).

### Members
- [ ] **Add member** with just a name and mobile number — nothing else should be required.
- [ ] Adding a **second member with the same mobile** is refused, and the message **names the person
      who already has it**.
- [ ] Editing a member and keeping their own number works (they are not their own duplicate).
- [ ] Search finds someone by **part of their name** and by the **last four digits** of their mobile.
- [ ] Filter chips (All / Expired / Expiring / Active / Owes money / No membership) show counts that
      add up, and each filter shows what it claims.
- [ ] The list is ordered by **who needs attention**: expiring first, then most recently lapsed —
      not alphabetically, and not with people who left two years ago at the top.
- [ ] **Archive member** removes them from the roster but keeps their payment history on their page.

### Plans
- [ ] With no plans, the Plans page offers a **starter price list**; using it creates five plans.
- [ ] Add a plan of 3 months at ₹3,000 → the card says what date it would run to if sold today.
- [ ] 🔬 **Editing a plan's price does not change any membership already sold.** Sell a plan, then
      raise its price, then re-open that member — the old price and old plan name must be unchanged.
- [ ] A **retired** plan disappears from the sell screen but existing members on it are untouched.

### Selling and renewing — the money moment
- [ ] Sell a 1-month plan starting today → **"Valid until"** shows the day before next month's same
      date, and the note says the next term starts the day after that.
- [ ] Renewing someone whose term is still running **starts the day after it ends**, not today.
- [ ] Renewing someone who lapsed months ago **starts today** — it must not backdate.
- [ ] 🔬 The **joining fee defaults to ₹0 for an existing member** and to the plan's fee for a new one.
- [ ] Typing a lower price records a **discount**, shown on the membership row.
- [ ] Leaving "Received now" blank creates the membership with the **full amount outstanding**.
- [ ] Paying part of it shows the correct **balance due** before you confirm, and after.
- [ ] Trying to receive **more than the total** is refused.
- [ ] 🔬 After renewing, the member reads **Active / "renewed through <date>"** and **disappears from
      "Talk to these members"** — the product must never chase someone who has just paid.

- [ ] 🔬 Try to start a new plan on a date the member is **already covered for** — it must refuse and
      tell you the date to start after.
- [ ] 🔬 Renew twice in a row. The second renewal must start **after the first one ends**, not inside
      it. (Starting inside it would sell the same year twice.)

### Money and receipts
- [ ] Every payment gets a receipt number like **2026-27/0001**, counting up with no gaps or repeats.
- [ ] A payment dated in a previous financial year (before 1 April) takes a number in **that** year's
      series.
- [ ] Outstanding on the member page equals the sum of what is unpaid across their terms.
- [ ] 🔬 **Record payment** appears for anyone who owes money, and settling it brings their
      outstanding down. Paying **more** than is owed is refused.
- [ ] 🔬 **Void** a receipt: it needs a typed reason, stays visible with "VOIDED" written on it, stops
      counting as money received, and its number is **never** given to the next receipt.
- [ ] 🔬 Cancelling a membership needs a typed reason, and can be **undone** afterwards.
- [ ] Cancelling stops it being chased for money — but the member's history still shows what was
      never collected, marked "not chased".
- [ ] 🔬 Archive a member who owes money. The gym's **"Money owed"** total on Today must **not** drop —
      archiving someone doesn't cancel their debt. They stay findable under the "Archived" and
      "Owes money" filters.

### Attendance
- [ ] **Check in** marks today; the button then reads "Checked in today".
- [ ] Pressing it twice does **not** record two visits.
- [ ] "Last visit" on the member page and in the roster updates.

### Today screen
- [ ] The six tiles agree with the roster (active count, expiring, recently lapsed, money owed,
      collected this month, check-ins today).
- [ ] **"Talk to these members"** shows only people expiring or lapsed **within the last 45 days** —
      nobody who left a year ago.
- [ ] **"Money to collect"** is ordered by largest amount owed.
- [ ] **Message** opens WhatsApp for the right number.

### Layout and accessibility
- [ ] On a **phone-width** window: bottom navigation bar, member **cards** (no table), and the page
      does **not** scroll sideways.
- [ ] On a **desktop-width** window: left sidebar and a member **table**.
- [ ] 🔬 Resizing the window between the two switches the layout cleanly — no sidebar left over a
      narrow page.
- [ ] Every button and filter chip is comfortably tappable (44px or more).
- [ ] Tab key reaches every control; Escape closes a dialog.
- [ ] Status is readable without relying on colour (the words "Expired"/"Expiring" are present).

### Data safety
- [ ] Settings → **"Erase and start fresh"** warns exactly what will be destroyed, and needs
      confirming.
- [ ] Settings → **"Load demo gym"** warns it replaces everything, and needs confirming.
- [ ] 🔬 Neither action can run by a single stray click.
- [ ] 🔬 Open the CRM in **two browser tabs** at once. Add a member in one and take a payment in the
      other, then refresh both — **nothing is lost** and the two receipts have different numbers.
- [ ] 🔬 Editing an **archived** member (to fix a typo) must not quietly put them back on the roster.
- [ ] 🔬 Add a member whose number belongs to an **archived** member — it offers to bring that person
      back instead of dead-ending.
- [ ] A **non-Indian** mobile number (e.g. +971) can be saved and then edited again without retyping.

### Overnight
- [ ] 🔬 Leave the CRM open past midnight, then check someone in. The visit must be recorded against
      **today**, not yesterday, and the date on Today's header must have rolled over.
