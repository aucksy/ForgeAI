# Policy pages for Razorpay and Cashfree (6 Nov 2026, checked 13 Nov 2026, approved and published 13 Nov 2026)

**PUBLISHED 13 Nov 2026 (R-480, he approved the wording).** The 4 pages are no longer drafts: their source is
`docs/legal/refund.body.html`, `delivery.body.html`, `contact.body.html`, `about.body.html`, built into
`apps/dashboard/public/` by `scripts/legal_pages.py` (same look and menu as Terms and Privacy; footer links on the gym
page). Customer-care and Grievance Officer phone: +91 86905 60741 (his business line, approved). The business address
row is left out until he gives one (an HTML comment in contact.body.html marks where it goes). Live with the next panel
deploy. Everything below is the history of how the wording was reached.

Razorpay and Cashfree check that the website has these pages before they approve a seller. Terms and
Privacy already exist. These 4 are drafts in `docs/drafts/` and are NOT live. They look exactly like
the Terms page. Two slots on the Contact page are marked **[TO CONFIRM]** (your business address and a
customer-care phone). Every page says "Last updated: [date of publishing]".

## 1. Refunds and cancellation (refund.html)
- Who pays: only gym owners. Members never pay MettleUp; member refunds are between them and their gym.
- 3 months free first, no card (same words as the sign-up screen), so nothing to refund during the trial.
- "We never charge you automatically": true today (UPI or bank transfer, sent by you) and at the launch of online payments (one payment per period). If AutoPay is added later, it stays off unless the gym switches it on; this page must change before AutoPay ships.
- No money back on any payment (DECIDED 6 Nov 2026, R-387); only a double or too-high payment made by mistake is refunded. Money back is kept as an Idea in the backlog.
- AI credits (from 0071): bought credits are not refunded or changed into cash and never expire; free credits end on the last day of each month; a task that fails gives its credits back automatically.
- Cancel any time, no lock-in, no fee: just do not pay again; the plan stays on until the paid date ends. Plan changes: today by email; with online payments, a smaller plan starts when the paid time ends, a bigger plan starts at once and you pay only the difference.
- If a gym stops paying: "we tell you in the admin app first, then we may switch off the paid features step by step" (the live Terms' words). The 7 extra days, 30 days basic mode, then read-only steps are described as coming with online payments (built, switched off).
- We never delete your data because a payment is late; if you ask, we delete your gym's data within 30 days (the live Terms' number).
- Refunds go back the way you paid, in 5-7 working days (Monday to Saturday) after approval.
- "Pro for life" means for as long as MettleUp runs this service.

## 2. Contact us (contact.html)
- Legal name (Aakash Pahuja, trading as MettleUp), email contact@mettleup.fit, and two slots: **[TO CONFIRM: customer-care phone]** and **[TO CONFIRM: business address]**. The real values go only into the live copy, never into this public repo.
- Grievance Officer: Aakash Pahuja, Founder. "We confirm we got your complaint within 48 hours and resolve it within one month" (the E-Commerce Rules 2020 timing; this is the law's complaint timing, not a support-speed promise).
- Gym members are told to ask their gym first.

## 3. About us (about.html)
- MettleUp is gym software for India, made and run by you alone in Jaipur.
- What it does (desk app for the gym, free workout app for members) and the prices from plans.ts: Starter ₹999 / ₹9,990, Pro ₹1,499 / ₹14,990, extra branch half price, founding offer ₹29,999 once ("You pay once. You never pay for this plan again."; first 25 gyms, until 31 Mar 2027).
- AI Assistant (coming soon) in three small tables: credits per task (1, or 3 for a plan), free credits (trial 20 once; monthly none; Starter yearly 50 a month; Pro yearly and founding 100 a month), packs (₹149 = 50, ₹399 = 150, ₹999 = 500). The pack prices are off the website's price cards (R-474) but stay here on purpose: payment companies expect a price for everything sold.
- "Our promises to gyms" moved here from the refund page.
- "Not registered under GST; no GST is charged."

## 4. Shipping and delivery (delivery.html)
- Nothing is shipped. It is online software.
- How you pay: UPI or bank transfer today, from the "Pay MettleUp" screen; we check the payment and turn the plan on. Card and net banking "coming soon", on the payment company's page; those turn the plan on at once.
- The founding offer cannot be paid from "Pay MettleUp" (it takes monthly or yearly only): "email us to pay".
- Today the "Pay MettleUp" screen lists each payment and whether it was confirmed. Receipts and the 7, 3 and 1-day reminders come with online payments (built, switched off).

## The promises to gyms (decided 6 Nov 2026, R-384)
1. Free set-up and moving your data from your old software or Excel.
2. No money back (the 3 free months are the way to try it).
3. Free training for your trainers and desk staff (when the gym asks).
4. The same price for life for founding gyms (the first 25 gyms): pay once, for as long as MettleUp runs this service.

No support-time promise anywhere. Reach us by email; the phone number goes on the Contact page once you give it.

## 13 Nov: expert check (T80)
Checked against the code, Indian law (Consumer Protection E-Commerce Rules 2020, the 2023 dark-pattern guidelines, the DPDP Act) and Zoho's terms. What changed:
- Removed "the founder's phone number is inside the app" from all 4 pages: no such screen exists in the admin app.
- Contact: added the address and customer-care phone slots, the Grievance Officer's title (Founder) and the 48-hour / one-month complaint timing. The law asks for all of these.
- Things that are built but switched off (receipts, 7/3/1-day reminders, pay-the-difference upgrades, later-start downgrades, the 7 days -> 30 days basic -> read-only steps) now say "when online payments start" or "we may", as the live Terms do.
- "Your data is never deleted" became "We never delete your data because a payment is late. If you ask us to, we delete your gym's data within 30 days." (the old line clashed with the live Terms and the data law).
- Refunds: added AI credits, "We never charge you automatically", and what "Pro for life" means; merged the repeated monthly section; moved the promises to About.
- Delivery: renamed "Shipping and delivery" (the name payment-company reviewers look for); "email us to pay the founding offer".
- About: AI credits as small tables; "You pay once. You never pay for this plan again."

Only you can give (both go only into the live copy, never into this public repo):
1. A business address for the Contact page that is not your home: your Udyam-registered address or a virtual office.
2. A customer-care phone number. The MettleUp WhatsApp number is already written in this public repo (notes, inbox, WhatsApp setup doc): tell us whether it is a business line. If it is, it can be the customer-care phone. If it is your personal SIM, it is already public.

When you approve, the pages move to the live website, get added to the website footer (and to the Terms and Privacy page menus), and the "draft" lines are removed.
