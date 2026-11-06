# Automatic buying and plan switching: design (6 Nov 2026, R-382)

Plain English first. Research behind it: `docs/overhaul/research/R-billing-india.md`.
Not tax advice: a CA should confirm the tax lines once money comes in.

## What a gym owner sees

1. On mettleup.fit they tap "Buy" under a plan (or "Start free" for the trial).
2. They type their gym name and phone. A WhatsApp code proves the phone is theirs.
3. They pay by UPI, card or net banking on the payment company's own secure page.
4. They land back in MettleUp. Within seconds the screen says "Pro is on until 6 Dec 2026".
5. Before the plan ends they get reminders 7, 3 and 1 days ahead, each with a "Pay now" link.
6. If they do not pay, they get 7 extra days, then 30 days of basic mode, then read-only. Their data is never deleted.

## The pieces

| Piece | What it does |
|---|---|
| Payment company | Razorpay (sign-up type "Individual"). Cashfree as the backup: apply to both the same week, use the first one that approves. Our server already has code for both (member fee collection, F79). |
| Checkout | Our server creates the order with the exact price (never the price the browser sends), opens the company's payment page. |
| Webhook | The payment company tells our server "paid". The server checks the signature, then calls ONE function: `apply_gym_payment` (built in T79). It sets the plan and the paid-until date and writes a ledger row. The same payment can never count twice (unique on company + payment id). |
| Backup way to pay | "Pay by UPI, Aakash confirms" (T79). Goes through the same function. |
| Plan features | One table says which plan gets which features. Today the switch exists but is off and only the screens check it. We switch it on and add the same check on the server, so nobody can get around it. |
| Receipts | Our own numbered receipt they can download from the app: "Not registered under GST; no GST charged." |
| Prices | Today prices are typed in 3 places (website, app, server). They become one list the other two read, with a test that fails if they differ. |

## Rules I chose (he can overrule)

- **Monthly plans:** one payment per month at launch. Automatic monthly charging (UPI AutoPay or card) comes in phase 2, once Razorpay confirms it is switched on for an individual account.
- **Yearly plans and the founding lifetime offer:** always a single payment. Indian bank rules (RBI, Apr 2026) make the customer approve every automatic charge above ₹15,000, so automatic yearly renewal would fail anyway.
- **Upgrade (Starter to Pro):** works at once; they pay only the difference for the days left.
- **Downgrade:** takes effect when the current period ends. No money back for the days left (except under the 60-day money back on the first yearly payment).
- **Free trial:** 3 months with Pro features (AI extras are not sold until they exist). One trial per verified phone.
- **Pro + AI:** not for sale until the AI features are built (the website says "Coming").
- **Extra branches at half price:** phase 2.
- **Test mode** until he says "payments live" (standing rule).

## What happens when a gym stops paying (DECIDED 6 Nov 2026, R-384)

1. **Plan end date.**
2. **7 extra days** with everything on.
3. **30 days of basic mode.** The desk keeps working for existing members: check-in, fee entry, member list. New members cannot be added. Pro extras are off.
4. **Read-only.** They can look and export. Paying reopens everything.

Data is never deleted.

## What only he can do

1. Sign up on Razorpay as "Individual" (PAN, Aadhaar, video check, the ₹1 bank test) and on Cashfree. Needs his ID.
2. Ask IDFC First in writing whether business payments into his savings account are fine.
3. Approve the policy pages the payment companies require: refund and cancellation, contact, about, delivery ("you get access online at once"). Terms and privacy exist. The refund page carries the 4 decided promises (R-384); one question is left: does the 60-day money back cover the ₹29,999 founding payment (recommended: no).

## Build order

1. Prices in one place + plan-features table + server-side checks (switch stays off until step 4).
2. Policy pages (drafts for his approval).
3. Checkout + webhook in test mode, both companies behind one adapter; renewal reminders; receipts.
4. Full UAT (happy path, failed payment, duplicate webhook, wrong amount, upgrade, downgrade, lapse, grace, renewal), fresh-eyes review, then he says "payments live".
