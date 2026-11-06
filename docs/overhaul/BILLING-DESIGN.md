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
- **Downgrade:** takes effect when the current period ends. No money back for the days left. No money back on any payment (DECIDED 6 Nov 2026, R-387), except a double or too-high payment made by mistake.
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
3. Approve the policy pages the payment companies require: refund and cancellation, contact, about, delivery ("you get access online at once"). Terms and privacy exist. The refund page says payments are not refunded (R-387); the 3 other promises stay (free set-up and data move, free trainer training, same price for life for founding gyms).

## Build order

1. Prices in one place + plan-features table + server-side checks (switch stays off until step 4).
2. Policy pages (drafts for his approval).
3. Checkout + webhook in test mode, both companies behind one adapter; renewal reminders; receipts.
4. Full UAT (happy path, failed payment, duplicate webhook, wrong amount, upgrade, downgrade, lapse, grace, renewal), fresh-eyes review, then he says "payments live".

## Step 3 built (6 Nov 2026, test mode, switched off, NOT applied)

- Database: `supabase/migrations/0063_gym_checkout.sql` (checkouts, receipts, plan changes, reminders; switch
  `app_config 'billing_checkout'` off; the receipt's legal name from `app_config 'receipt_issuer'`). Test:
  `supabase/tests/0063_gym_checkout.sql`.
- Checkout and webhook: the HQ Worker (`deploy/hq/billing.js`), because only it holds the server key that
  `apply_gym_payment` needs. The admin app's "Pay online" goes through the gym panel (`/api/billing/checkout`),
  which forwards to HQ. Webhook: `https://hq.mettleup.fit/billing/hook/razorpay` (or `/cashfree`).
- Admin app: "Pay online" and "Your receipts" on Pay MettleUp, a printable receipt, and the plan-end reminder on
  Today (only when the switch is on). Reminders by WhatsApp/SMS: a stub that sends nothing.
- To switch on in test mode: HQ var `BILLING` = `test`, `BILLING_PROVIDER`, the test keys as Worker secrets
  (listed in `deploy/hq/wrangler.jsonc`), 0063 applied, the switch row on, the legal name row filled.

## Gaps closed (6 Nov 2026, NOT applied, switched off)

- **No trial day is lost.** A gym that pays during its free trial gets its paid month or year counted from the
  day the trial ends, not the day it pays. Same for "Pay online" and for HQ's manual UPI confirm (both go
  through `apply_gym_payment`; helper `_paid_from` in `0063_gym_checkout.sql`). Starter bought during the
  trial: the trial's Pro features run to its end, then Starter starts. Founding (for life) is unchanged.
  The owner sees the real dates before paying: "Your paid plan starts when your free trial ends on <date> and
  runs until <date>." (admin app `trialStartLine`). HQ's Confirm line says the same.
- **Payments to check.** Money the company took that did not become a plan (wrong amount, or the gym changed
  in between) is listed in HQ (Payments page, "Online payments to check", and a "Needs you" line): gym, amount
  paid and asked, reason, date, payment id. HQ refunds it in the company's dashboard (or sets the plan by
  hand), then marks it "refunded" or "added by hand" with a note; each mark is one line in HQ's log.
  `supabase/migrations/0064_billing_checks.sql`.
- **Nightly check for missed webhooks.** HQ Worker cron `15 22 * * *` (03:45 India time) asks the company
  about every link we opened in the last 48 hours that is still open; a paid one goes through
  `hq_billing_paid`, the same path as the webhook, so a duplicate changes nothing (`runBillingReconcile` in
  `deploy/hq/billing.js`). Off unless `BILLING` is set and the keys exist. At most 20 links a night (10 for
  Cashfree) to stay inside the free plan's 50 calls per run.
