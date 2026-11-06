# R-billing-india — how MettleUp should take money from gym owners

Researched 6 Nov 2026. Web research only, nothing built. Sources are listed at the end with the
date each was read. Anything marked **UNCONFIRMED** could not be checked against an official page.
**This is not tax or legal advice.** Before the first rupee arrives, have a CA confirm section 5 in one call.

---

## The short answer

- **Use Razorpay.** It openly takes "Individual / Unregistered" sellers with a personal PAN and the
  seller's own bank account, and its subscription product is the best documented in India.
  **Keep Cashfree as the backup.** It also takes individuals, and it has a 0% fee offer that is
  worth money at your size.
- **One fact shapes the whole design:** a renewal above **₹15,000** cannot be charged automatically
  in India. The customer has to approve each one. Razorpay hides UPI AutoPay completely above ₹15,000.
  So **monthly plans can renew automatically. Yearly plans (about ₹18k to ₹30k) cannot.** Sell yearly
  as a one-time payment, then send a "renew now" link with reminders.
- **Launch with one-time payments only** (monthly, yearly, lifetime), with access running until a
  "paid until" date. Add automatic monthly renewal once Razorpay switches on Subscriptions for your
  account. Both feed the same table, so the app never needs to know how a gym paid.

---

## 1. Which gateways take an individual with a savings account and a PAN

| Gateway | Individual, no GST? | KYC | Website needs | Approval | Settlement |
|---|---|---|---|---|---|
| **Razorpay** | **Yes.** "Unregistered → Individual" is a sign-up type | Personal PAN. ID and address pulled from CKYC through an OTP; if that fails, Aadhaar through DigiLocker or an upload, then video KYC. Bank account and IFSC, checked with a ₹1 deposit; if that fails, a video of a cancelled cheque | Policy pages are checked automatically when a website is added: About, Contact, Pricing, Terms, Privacy, Cancellation/Refund, plus Shipping/Delivery. Also a sample invoice | The team reviews before live mode. The CKYC path is described as "minutes instead of days"; one FAQ says 3–4 business days | T+1 (instant settlement costs extra) |
| **Cashfree** | **Yes.** "Sign up as an Individual"; your Aadhaar must be linked to your phone | PAN, Aadhaar, bank details. Since 1 Jan 2026: video KYC | The site must be live (or the app on Play). Must have: Terms, About, Contact (an email and a phone), Privacy, business name. Refund, Delivery and Pricing pages depending on the business | 24–48 working hours after documents are checked | Next day by 8 pm under the current offer; instant settlement costs 0.30% |
| **PayU** | Probably. Its API has a CKYC flow for "Individual / Sole Proprietorship" | PAN plus CKYC | UNCONFIRMED | UNCONFIRMED | UNCONFIRMED |
| **PhonePe PG** | **UNCONFIRMED.** PhonePe's own article contradicts itself and once says gateways "require a GSTIN" | UNCONFIRMED | Product, pricing, refund and contact pages (PhonePe article) | UNCONFIRMED | UNCONFIRMED |
| **Easebuzz** | Unclear. Its own page lists GST among the basic documents | PAN, GST, bank statement, registration | UNCONFIRMED | UNCONFIRMED | UNCONFIRMED |
| **Instamojo** | Built for individuals, **but** the RBI refused its payment-aggregator licence in Sept 2023 (reported by competitor Dodo; UNCONFIRMED) | KYC | — | — | — |
| **Paytm PG** | Taking new sellers again: final RBI licence on 26 Nov 2025. Individual eligibility UNCONFIRMED | — | — | — | — |
| **Stripe India** | **No.** Invite-only since May 2024; a registered business is needed | — | — | — | — |
| **Paddle / Lemon Squeezy / Dodo** (they sell on your behalf as the "merchant of record") | Built to sell *abroad*. Dodo itself admits it costs more for India-only sales (about 4% + 15¢). Paddle has UPI only below ₹15,000 and is in early access; payout in INR UNCONFIRMED | — | — | — | — |

Since 1 Jan 2026 the RBI has required a live check (video KYC) when anyone signs up with a payment
aggregator. Expect this with Razorpay and Cashfree as well.

## 2. Fees (all fees also carry 18% GST, which you **cannot** claim back because you are not GST-registered)

| | Razorpay (pricing page, "last updated May 2026") | Cashfree |
|---|---|---|
| UPI (one-time) | **2% "platform fee"**. The page says UPI has "Zero MDR", but Razorpay still charges 2% as a technology fee | "As per applicable law" (probably 0%); standard rate 1.95% |
| Cards, net banking, wallets | 2%; corporate cards 2.15%; international up to 3% | 1.95–2.0%; Amex 2.95%; international 2.99% |
| Subscriptions, cards | **0.9% on top of the platform fee** (about 2.9% in total) | ₹7.5 per mandate + ₹7.5 per debit |
| Subscriptions, UPI AutoPay | **"Pricing on request"** | ₹7.5 + ₹5 (below ₹1,000) or ₹7.5 + ₹15 (₹1,000 and above) |
| Setup / yearly fee | ₹0 / ₹0 | ₹0 setup. **Offer:** new sellers who signed up on or after 21 Jul 2026 pay a **0% platform fee on the first ₹20 lakh** of sales (until 31 Mar 2027 or until the cap is used). E-mandate subscriptions, Amex, EMI and corporate cards are excluded; the offer can be withdrawn if 60% or more of sales are on credit cards. GST on the fee still applies |

Worked examples (Razorpay): a ₹1,499 card renewal costs about ₹43 + ₹8 GST, roughly **₹51 (3.4%)**.
A ₹17,988 yearly UPI payment costs ₹360 + ₹65 GST, roughly **₹425 (2.4%)**.

**Is UPI free?** For the payer, yes. For the seller, government rules keep MDR at zero below ₹2,000.
From **15 Oct 2026**, ordinary shop payments above ₹2,000 reportedly carry a **0.4% MDR, capped at ₹300**
(an NPCI decision, as reported by Inc42 on 15 Sep 2026). Other outlets say the rate was not yet final, and
none says how it applies to online gateway sellers or AutoPay, so treat it as **UNCONFIRMED**. In
practice the gateways' own fee (Razorpay's 2%) matters more than MDR anyway.

## 3. Automatic renewals

- **RBI E-mandate Framework 2026** (circular dated 21 Apr 2026, covering cards, UPI and wallets):
  the customer approves once, then renewals **up to ₹15,000** go through without an OTP. Above
  ₹15,000, **every** renewal needs the customer's approval. Only insurance, mutual funds and
  credit-card bills get ₹1 lakh. A gym-software subscription is not in that list.
- **Notice before each charge:** at least **24 hours** before the debit, showing the merchant, amount
  and date. The customer can cancel before it is taken. Banks may not charge customers for mandates.
- **Razorpay specifics:** UPI AutoPay shows at checkout **only when the amount is below ₹15,000**, and
  some UPI apps (PhonePe, BHIM) refuse higher mandates. For card plans above ₹15,000, the bank sends
  an approval link valid for 72 hours. Razorpay starts the debit about 36 hours before the due date
  (an older FAQ line says 24 hours, so this is UNCONFIRMED). E-mandate (net banking or Aadhaar) goes
  up to ₹1 crore but is slow (the bank takes 24 hours or more to confirm).
- **When a renewal fails (Razorpay):** the subscription becomes `pending`, and Razorpay retries on
  day +1, +2 and +3 (four attempts in all, for both cards and UPI). Then it becomes `halted`. Once a
  customer fixes a halted subscription, **Razorpay does not re-charge the missed bills**; only future
  bills are charged. Your code must take the missed money with a new payment link. The customer can
  switch card → UPI, but a UPI or e-mandate subscription can only move to a card.
- **Changing plan:** `schedule_change_at` takes `now` or `cycle_end`. **Subscriptions set up through
  UPI or e-mandate cannot be changed.** You must cancel them and create a new one. Razorpay's docs
  do not describe proration.
- **Getting it switched on:** UPI AutoPay on Subscriptions is reported to need a support request
  (UNCONFIRMED: forum signal). Whether an *individual* account can get Subscriptions at all is
  **UNCONFIRMED**; ask Razorpay support before building on it.
- Cashfree (Subscriptions: UPI AutoPay and eNACH) and PhonePe PG (AutoPay API, including a pay-link
  version) also support mandates. Neither was checked in depth.

## 4. Webhooks and fitting it to a static site + Supabase

- **Razorpay subscription events:** `subscription.authenticated`, `activated`, `charged`, `completed`,
  `updated`, `pending`, `halted`, `cancelled`, `paused`, `resumed`. One-time payments use the
  standard payment and order events (`payment.captured`, `order.paid`) and Payment Link events.
- **Security:** the `X-Razorpay-Signature` header carries an HMAC-SHA256 of the **raw** request body,
  made with the webhook secret. Check it against the raw bytes, never against re-encoded JSON.
  Remove duplicates using the `x-razorpay-event-id` header. Deliveries are retried for about 24 hours
  and your endpoint should answer within about 5 seconds (both from a Razorpay blog, not the core docs:
  UNCONFIRMED). A webhook that keeps failing gets switched off and must be switched back on in the
  dashboard.
- **Test mode:** a separate set of test keys. Subscription testing has limits: test card tokens last
  only 3 days, so a later charge can only be tested within 3 days.
- **Fit with the static site:** fine. The browser asks a Supabase Edge Function (or Cloudflare
  Worker) to create an order or subscription with the secret key. Razorpay's hosted checkout opens
  on the page, and the webhook goes to a second Edge Function that writes to the database. Payment
  Links (via the API, with a due date) suit renewal reminders. Never trust the browser's "success"
  message; only the webhook (or a server-side check of the payment) gives access.

## 5. Tax and paperwork (not tax advice)

- **GST:** registration is needed only above **₹20 lakh** a year of services. Rajasthan is a normal
  state; the ₹10 lakh limit is only for the north-eastern special-category states. Selling to gyms in
  other states does **not** force registration: **Notification 10/2017-Integrated Tax (13 Oct 2017)**
  exempts inter-state *service* suppliers below the threshold. Selling from your own website is not
  selling "through an e-commerce operator", so that compulsory-registration rule should not apply
  (UNCONFIRMED: CA to confirm).
- **Receipts:** an unregistered seller **must not charge GST or show a GSTIN**, and cannot issue a GST
  "tax invoice". Give a plain numbered receipt: your name, address and PAN-holder name, the customer's
  gym name, plan, period, amount, and the line "Supplier not registered under GST; no GST charged."
  GST-registered gyms cannot claim input credit on it. For them that is a small cost, but some may ask
  for a GST invoice; you cannot give one until you register.
- **Income tax:** from **1 Apr 2026** the new **Income-tax Act 2025** applies. Old 44AD and 44ADA are
  merged into **section 58**, with the same limits and rates. SaaS subscriptions look like **business**
  income (old 44AD): profit is assumed to be **6% of digitally received turnover**, up to ₹3 crore when
  95% or more is received digitally. The professional 50% scheme (old 44ADA) is for services like
  consulting, and blogs disagree about product SaaS. Have the CA choose. Under section 58, losses
  and deductions cannot be set off against the assumed profit.
- **Savings account:** Razorpay and Cashfree both accept an individual's own account and check it with
  a ₹1 deposit. Whether IDFC First's savings-account terms allow regular business receipts is
  **UNCONFIRMED**. Many banks expect a current account for trade, and large regular credits can trigger
  a review. Ask the bank in writing. A current account in your own name (after a free Udyam
  registration) is the clean fix later.

## 6. How established SaaS billing works (conventions, not law)

- **Trial to paid:** Indian gym-software vendors usually give a 14–15 day trial without a card
  (GymManager, AskFitness, VIOFIT listings). Ask for payment when the trial ends; do not take a card up front.
- **Failed renewal:** Stripe lets the seller set the retry window and the end state (`past_due`,
  `unpaid` or `canceled`). Razorpay retries for 3 days and then halts. Common SaaS practice is a
  **7–14 day grace period** with emails on day 0, 3, 7 and the last day (convention, not a sourced
  rule). GymMaster stops a member's billing after 4 missed payments.
- **When a plan lapses:** go **read-only** (they can see and export everything; they cannot add new
  members). Never lock them out and **never delete data**. The owner's member records are their business.
- **Upgrade now (charge the difference or start a new period); downgrade at renewal.** That matches
  Razorpay (downgrades with offers can only happen at cycle end).
- **Refunds:** state them plainly on the refund page Razorpay requires, for example "monthly: no
  refund, cancel any time, access until period end; yearly: pro-rata refund within 14 days". Refunds
  go back through the gateway.
- **Cancellation:** they keep access until the paid-until date; renewals stop.
- **Receipts:** your own running number (e.g. MU-2026-0001) with no gaps, sent by email, plus the
  gateway's payment ID.
- **Features by plan:** one table maps each plan to its features, and the app checks "plan + paid-until
  + grace" in one place.
- **What competitors do for their own billing:** Gymdesk's and others' own billing pages could not be read
  (403 or not found), so this is **UNCONFIRMED**.

## 7. Recommendation

**Gateway: Razorpay, sign-up type Individual.** It is the only one with both official individual
onboarding and well-documented subscriptions, retries and webhooks. **Also apply to Cashfree**
(as an Individual) the same week. Its 0% fee on the first ₹20 lakh of one-time payments would save
about 2% on yearly and lifetime sales, and it is a fallback if Razorpay refuses. Use one at a time in
code; choose after both reply.

**Design:**
1. A `billing` table per gym: plan, paid_until, status. Features are read from a plan table.
2. Every purchase is a **one-time Razorpay order** for monthly, yearly or lifetime (paid_until = far
   future). The webhook moves paid_until forward. This works for every amount and every payment method.
3. Renewal: emails or WhatsApp at 7, 3 and 1 days before expiry, each with a Payment Link. Then a
   7-day grace period, then read-only.
4. Phase 2: offer **automatic monthly renewal** (Razorpay Subscriptions; UPI AutoPay works below
   ₹15,000) once Razorpay confirms it is switched on for an individual account. Yearly stays one-time.
5. Webhook Edge Function: check the signature on the raw body, de-duplicate on the event ID, keep a
   log of every event, and run a nightly check against Razorpay's API so a missed webhook is caught.

**Main risks:** (a) Razorpay refuses or delays an individual account, or will not switch on
Subscriptions (have Cashfree ready). (b) The savings account gets flagged by the bank. (c) The ₹20 lakh
GST line; at ₹1,499 that is about 110 gyms on yearly plans, so watch turnover. (d) The "lifetime" deal
is open-ended free AI usage, so cap or define it. (e) The policy pages must exist and match before review
(Terms, Privacy, Refund/Cancellation, Contact with phone and email, Pricing, About, Delivery: "online,
instant").

---

## Sources (read 6 Nov 2026)

- Razorpay pricing, "last updated May 2026": https://razorpay.com/pricing/
- Razorpay sign-up: https://razorpay.com/docs/payments/sign-up
- Razorpay KYC by business type: https://razorpay.com/docs/payments/business-types-kyc-documents.md
- Razorpay website/policy details: https://razorpay.com/docs/payments/dashboard/account-settings/business-website-details/
- Razorpay Subscriptions: https://razorpay.com/docs/payments/subscriptions/
- Razorpay supported methods and limits: https://razorpay.com/docs/payments/subscriptions/supported-payment-methods/
- Razorpay Subscriptions FAQ (₹15k, AFA, pre-debit): https://razorpay.com/docs/payments/subscriptions/faqs/
- Razorpay payment retries: https://razorpay.com/docs/payments/subscriptions/payment-retries/
- Razorpay states/lifecycle: https://razorpay.com/docs/subscriptions/lifecycle/
- Razorpay subscription webhooks: https://razorpay.com/docs/webhooks/subscriptions.md
- Razorpay update subscription: https://razorpay.com/docs/api/payments/subscriptions/update-subscription/
- Razorpay recurring webhooks (signature, event id): https://razorpay.com/docs/api/payments/recurring-payments/webhooks/
- Razorpay webhooks blog (24h retry, 5 s; UNCONFIRMED): https://razorpay.com/blog/?p=28285
- Razorpay Payment Links: https://razorpay.com/docs/payments/payment-links/
- Cashfree pricing and festive offer T&Cs: https://www.cashfree.com/payment-gateway-charges/
- Cashfree onboarding FAQs: https://www.cashfree.com/docs/help/onboarding-related/onboarding-faqs
- Cashfree unregistered businesses (mid-2026): https://www.cashfree.com/blog/payment-gateway-for-unregistered-businesses/
- PhonePe "PG without GST" (May/Jun 2026): https://business.phonepe.com/articles/payment-gateway-without-gst-do-you-need-registration-to-accept-payments
- PhonePe fee article (Jun 2026): https://business.phonepe.com/articles/payment-gateway-charges-in-india-complete-mdr-and-fee-breakdown
- PhonePe AutoPay API: https://developer.phonepe.com/payment-gateway/recurring-payments/autopay/api-integration/api-reference/subscription-setup
- PayU individual CKYC API: https://docs.payu.in/docs/refer-merchants-using-api
- Easebuzz SME page: https://easebuzz.in/explainers/sme/payment-gateway-for-small-business/
- Stripe India invite-only: https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india
- Stripe India video KYC from 1 Jan 2026: https://support.stripe.com/questions/video-kyc-for-india-onboarding
- Paytm final PA licence (Nov 2025): https://www.business-standard.com/markets/news/paytm-shares-rise-as-rbi-gives-final-nod-to-operate-as-payment-aggregator-125112700299_1.html
- Dodo Payments on India pricing: https://dodopayments.com/blogs/razorpay-alternatives/
- Dodo on Instamojo licence (competitor source): https://dodopayments.com/blogs/instamojo-alternatives
- Paddle UPI AutoPay changelog (2026): https://developer.paddle.com/changelog/2026/upi-autopay/
- RBI E-mandate Framework 2026 coverage (21 Apr 2026): https://www.businesstoday.in/personal-finance/news/story/rbi-caps-recurring-payments-at-rs15000-without-otp-under-new-e-mandate-framework-526759-2026-04-21
- RBI e-mandate notification page: https://website.rbi.org.in/web/rbi/-/notifications/processing-of-e-mandates-for-recurring-transactions-12341
- UPI MDR 0.4% above ₹2,000 from 15 Oct 2026 (Inc42, 15 Sep 2026): https://inc42.com/buzz/npci-notifies-0-4-mdr-on-p2m-upi-transactions-over-%e2%82%b92000/
- Counter-view, rate not final: https://digitalterminal.in/government/government-allows-mdr-on-upi-payments-above-2000
- GST Council registration flyer: https://www.gstcouncil.gov.in/sites/default/files/e-version-gst-flyers/Registration_under_GST_Law_new.pdf
- Notification 10/2017-Integrated Tax: https://taxheal.com/notification-no-102017-integrated-tax.html
- Section 58, Income-tax Act 2025 vs 44AD/44ADA (25 Jan 2026): https://taxguru.in/income-tax/presumptive-taxation-residents-1961-act-via-a-vis-2025-act.html
- 44ADA vs 44AD for software (secondary): https://takehomecalc.pages.dev/blog/44ada-for-software-freelancers
- Stripe Smart Retries: https://docs.stripe.com/billing/revenue-recovery/smart-retries
- GymMaster failed billing: https://www.gymmaster.com/help/help_understanding_failed_billing/
- Indian gym software trials (listings): https://www.capterra.com/p/10048972/GymBoss/ , https://mdmsolutions.biz/products/gymmanager
