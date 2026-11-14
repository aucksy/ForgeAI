# Gym payments: the money flow and the test matrix

Payment sweep R-542, 14 Nov 2026. Scope: every path where money moves for a gym.

- **New (not deployed yet):** paying online when joining, from the join link or the gym web page.
- **Existing:** F79 member payments, which use the gym's own Razorpay, Cashfree, PayU or PhonePe account, or its plain UPI ID. This covers links, webhooks, receipts and the shop.

Payments stay in **test mode** until the Worker has `PAY_LIVE=on`. Nothing in this sweep turns that on.

How to read the matrix: every row is one angle, what must happen, and the test that proves it.

- **Before** shows the result on the code before this sweep: FAIL means the sweep found a real bug there.
- **Now** shows the result after the fix.
- `W-xx` tests live in `deploy/panel/payAngles.test.mjs` (the Worker, run against the real D1 migrations).
- `D-xx` tests live in `apps/dashboard/test/crm/joinPay.test.ts` and `pay.test.ts` (the admin app).
- `e2e` tests are the Playwright tests in `apps/dashboard/e2e/`.
- `SQL` tests are in `supabase/tests/`. CI runs all of them (`ci.yml`).

---

## 1. The money flow, in plain English

### Joining online (new)

1. **The person fills the join form.** The browser sends their name, their phone, a one-time number proof (the code sent to their phone), and the plan they chose. It does **not** send an amount. Any amount it does send is ignored.
2. **The gym server prices it.** The Worker calls `self_join_send` on Supabase. The server checks the number proof (one use only, at most 15 minutes old), refuses the person if they are already a member (MEMBER) or have tried too many times (TOO_MANY), and then answers with an `enquiryId` and `totalP`.
   - `totalP` is the plan price plus the joining fee, in paise.
   - This is the **only** place the amount comes from. No GST or other charge is added anywhere.
3. **The Worker asks the gym server for the gym's id.** It calls `self_join_pay_gym` with a signature: an HMAC of `sjpay.<CODE>.<time>` made with the secret the gym server shares with the Worker. The signature must be at most 5 minutes old. Without it, nobody can find which gym a join code pays.
4. **The Worker makes one payment request.** This is a `pay_requests` row of kind `join`, with the ref set to the `enquiryId`, and the mode (`test` or `live`) taken from `PAY_LIVE`. If an open row already exists for that enquiry at the same amount, that row is reused, so sending twice gives one request.
   - If the amount has changed, the old row is first checked with the company: if it was already paid, that payment stands. Otherwise the old link is closed, here and at the company.
5. **A link or a UPI ID.**
   - When the gym has a connected company whose mode matches the Worker's mode, the Worker makes a payment link at that company for exactly `totalP`. Cashfree takes rupees; the Worker converts the paise exactly.
   - Otherwise, when the gym has a UPI ID, the page shows a UPI app link with `am=` set to the same amount.
   - Otherwise, the person pays at the desk.
   - The gym's company keys are stored sealed with AES-GCM under `PAYMENTS_MASTER_KEY`, and are never sent back.
6. **The person pays at the company.** Only the company can say "paid". Paid is learnt in two ways:
   - **Webhook.** It must carry the company's signature, made with the gym's own webhook secret:
     - Razorpay: hex HMAC-SHA256 of the raw body.
     - Cashfree: base64 HMAC-SHA256 of the timestamp plus the body.
     - PayU: sha512 reply hash.
     - PhonePe: sha256 of `username:password`.

     The webhook URL holds a per-connection id, so a gym's hook can only touch that gym's requests. A partner webhook ("Connect Razorpay") has no such id, so the account in the event must be the connection of the **same gym** as the request.
   - **Check.** The Worker asks the company's own status API when the page or the desk asks, and every 10 minutes by itself. Only a Razorpay payment that is **captured** counts; "authorized" alone does not.
7. **Paid is recorded once.** `markPaid` writes a `pay_events` row keyed by (company, payment id). A second webhook, a webhook plus a check, or a second payment on the same request never pays twice. The amount recorded (`paidP`) is what the company says was paid, never the asked amount.
8. **UPI "I have paid".** With a plain UPI ID nobody can verify the payment, so the tap only marks the request `said`. It is never paid. The desk must look in its bank or UPI app.
9. **The desk approves.** On Today, the "Joined online" row shows what was really paid. Pressing Approve:
   - asks first, with the amount, for a UPI payment nobody has confirmed, or when the paid amount is not the plan;
   - takes a 5-minute claim, so two desks cannot both record it;
   - makes the member and the plan, and saves a receipt with `requestId = pay-<request id>` (the store saves one receipt per requestId, so pressing twice gives one receipt);
   - tells the Worker it was recorded.

   **A test-mode payment never becomes a receipt.** The member and the plan are made and the fee stays due.
10. **The safety net.** The receipts sweep ("Paid online, receipt not made") shows the desk any real paid join that nobody approved, and any second paid row, so no money is silently lost.

### Member fees and the shop (existing, F79)

Members pay with the same pieces. The desk makes a link for a membership's due amount, or the member app makes one for a shop order. The amount comes from the gym server's own records, never the browser. Then the same signature checks, the same `markPaid` and `pay_events`, and the same claim plus requestId apply.

The receipts sweep makes a receipt by itself only when:
- the membership is still there,
- the amount is not more than what is due, and
- the payment is real (not test mode).

The shop's "Paid online" marker also ignores test payments.

### Refunds

There is no refund call. The gym refunds in its own company dashboard, then voids the receipt on the member's page. A voided receipt keeps its number, puts the money back on the member's tab, and is left out of every total.

---

## 2. The matrix

| # | Angle | What must happen | Test that proves it | Before | Now |
|---|---|---|---|---|---|
| 1 | Paid | Paid once. The page, the desk and the company show the same amount. | W-01; pay.test.mjs "a request makes a Razorpay link..."; joinPay.test.mjs "a company link for the gym server price..."; e2e "R-528 page: online on (test mode)..." | PASS | PASS |
| 2 | Failed | The failure is shown. The request stays open and payable and is never paid. | W-02; pay.test.mjs "failed try keeps the link open..."; joinPay.test.mjs "a failed or abandoned payment..."; e2e "R-528 page: a payment that fails..." | PASS | PASS |
| 3 | Cancelled at the company | Closed and not paid. A payment that still arrives later is recorded as late. | W-03/W-04; pay.test.mjs "...a payment after a cancel is still recorded (late)" | PASS | PASS |
| 4 | Timed out / link expired | Same as cancelled. "Expired" after "paid" never unpays it. | W-03/W-04, W-09 | PASS | PASS |
| 5 | Razorpay "authorized", not captured | **Not paid** until the money is captured. | W-05 | **FAIL (B1)** | PASS |
| 6 | Page closed half way and reopened | The same request and link come back. Nothing new is made. | W-06 | PASS | PASS |
| 7 | Double tap on Send / two tabs | One request and one company link. | W-07; joinPay.test.mjs "...sent twice = the same payment" | PASS | PASS |
| 8 | Double tap on Pay / two payments for one request | Paid once. The second payment is only logged, and the desk sees the second paid row. | W-08; D-06 | PASS | PASS |
| 9 | Webhook twice, late, out of order | Paid once. A late "expired" changes nothing. | W-09; pay.test.mjs "Cashfree: ... marks paid once" | PASS | PASS |
| 10 | Webhook missing | The 10-minute check finds the payment by itself. | W-10; pay.test.mjs "the scheduled check finds an open link paid" | PASS | PASS |
| 11 | Webhook forged / bad signature / unsigned | Refused with 401. Nothing is paid. | W-11; pay.test.mjs "Razorpay webhook: hex HMAC...", "Cashfree webhook: base64 HMAC...", "PayU...", "PhonePe..." | PASS | PASS |
| 12 | Webhook for another gym (per-gym hook) | Cannot pay another gym's request. | W-12 | PASS | PASS |
| 13 | Partner webhook for another gym's account | Never pays a request of a different gym. | W-13 | **FAIL (B2)** | PASS |
| 14 | Webhook for a different amount | The amount really paid is kept. The desk sees both amounts and is asked before Approve. | W-14; D-02; D-03 | PASS on the Worker; **the desk FAILED (B5)** | PASS |
| 15 | Webhook with no id, not JSON, or an unknown request | Answered 200. Nothing changes. | W-15 | PASS | PASS |
| 16 | Amount tampered in the browser | Every amount the page sends is ignored, on Send, on the check and on "I have paid". | W-16; selfJoin.test.mjs (the amount only from the server's `totalP`) | PASS | PASS |
| 17 | Plan price changed between the form and the payment | The old link is closed, here and at the company, before a new one is made. | W-17 | **FAIL (B3)** | PASS |
| 18 | Price changed, but the old link was already paid | No new payment. The paid one stands. | W-18 | **FAIL (B3)** | PASS |
| 19 | Rounding (paise / rupees) | Cashfree is in rupees both ways, Razorpay in paise. Odd paise survive. The page, the UPI `am=` and the desk use one format. | W-19; D-07; uatMoney.test.ts "three instalments of an odd total settle it to the paisa" | PASS | PASS |
| 20 | GST-free totals | No GST or other charge is added. The link amount is exactly plan price plus joining fee. | W-20; SQL 0077 "1total/3total" (= price + fee); SQL 0081 "2total" | PASS | PASS |
| 21 | Switch turned off mid-flow | New joins pay at the desk. A payment already started is still learnt. | W-21; joinPay.test.mjs "pay-info: online only with ... the switch on"; e2e "Settings -> Payments, the two switches" | PASS | PASS |
| 22 | Payment account removed mid-flow | Open links are checked first, and any paid one is kept. The rest are closed at the company and here. | W-22; pay.test.mjs "disconnect wipes the sealed keys..." | **FAIL (B4)** | PASS |
| 23 | Gym server down | On Send: "try again", and nothing is kept. When finding the gym fails: the request is kept and the person pays at the desk. | W-23 | PASS | PASS |
| 24 | Payment company down | No link and no UPI means pay at the desk (the request is kept). A check while it is down changes nothing. | W-24 | PASS | PASS |
| 25 | Our database (D1) failing | The request is kept, and the page says pay at the desk. | W-25 | PASS | PASS |
| 26 | Test vs live keys | A live key is refused in test mode. Once live, a test connection never makes a link for a real member. | W-26; pay.test.mjs "connect: ... keys checked" | **FAIL (B11)** | PASS |
| 27 | A test payment treated as real money | Anyone can "pay" a test link with a test card. It never becomes a receipt (Approve, the desk sheet, the receipts sweep) and never shows "Paid online" on the Shop. | D-01; D-04; W-32; e2e "R-542 phone: a TEST-mode payment approved..."; e2e "F79 phone: ... a test-mode payment link" | **FAIL (B8)** | PASS |
| 28 | Two joins with one phone | Linked to the same request, so one payment. | W-27; SQL 0081 "2linked/2linkedid" | PASS | PASS |
| 29 | Already a member | Refused (MEMBER). No payment is made. | W-27; SQL 0077 "5member" | PASS | PASS |
| 30 | Too many tries | Refused (TOO_MANY). No payment is made. | SQL 0077 "7number/7gym" | PASS | PASS |
| 31 | Approve twice / by two desks | One claim wins. The other desk is told it is taken. Recording needs the claim. Twice is one receipt. | W-28; local.test.ts "the same press sent twice (C7-1 requestId) is one receipt" | PASS | PASS |
| 32 | Approve after the plan was deleted | The paid join is never lost. It is shown in "Paid online, receipt not made", or healed if a receipt already exists. | D-05; e2e "R-542 phone: ... a paid join nobody approved is shown" | **FAIL (B6)** | PASS |
| 33 | Refund after Approve | The gym refunds at its company, then voids the receipt. The number is kept, the money goes back on the tab, and the receipt is left out of totals. | collections.test.ts "puts a voided receipt's money BACK on the tab", "keeps the void out of the total"; uatMoney.test.ts "a cancelled receipt keeps its number" | PASS | PASS |
| 34 | UPI "I have paid" without paying | Never paid and never in the receipts sweep. Approve asks "Can you see ₹X from NAME in your bank or UPI app?" first. | W-29; D-02; joinPay.test.mjs "a plain UPI ID: 'I have paid'..."; e2e "R-528 phone: a UPI payment to check in the bank..." | **FAIL (B7)**, one tap | PASS |
| 35 | Receipts numbered once | No number is minted twice, even with two desks at once. A cancelled receipt's number is never reused. | local.test.ts "does not mint the same receipt number twice"; cloud.test.ts "two desks taking money at once get different receipt numbers"; uatMoney.test.ts "a cancelled receipt keeps its number..." | PASS | PASS |
| 36 | Nothing marked paid without a verified company event | The page, a guessed id, a fee id and a shop id all fail. | W-30 | PASS | PASS |
| 37 | Owner and member see the same amount | The page, the link, the desk and the receipt all carry the server paise. | W-01; D-07; e2e "R-528 phone: 'Paid online' on Today..." (₹2,000 on both sides) | PASS | PASS |
| 38 | The Hindi (Hinglish) page shows the same amounts | ₹ and every number are kept in the Hinglish words. | D-07 (English and Hindi Pay now); the Hinglish dictionary test (keeps ₹ and numbers) | PASS | PASS |
| 39 | Logs hold no card, phone or secret | No card, phone, name, UPI ID, key, secret, proof or amount in any log line. | W-31; pay.test.mjs "connect: ... never answered back" | PASS | PASS |
| 40 | Keys stored safely | Sealed with AES-GCM. The plain text never shows. A wrong key or a changed byte fails. | pay.test.mjs "seal and unseal: round trip..." | PASS | PASS |
| 41 | Server part not ready | Every call says NOT_READY. The page is the desk page. | pay.test.mjs "tables missing..."; e2e "R-528 page: before the server part is live..." | PASS | PASS |
| 42 | Gym server signature for the gym id | Only a fresh (at most 5 minutes old) Worker signature for this code works. A paused gym is CLOSED. | SQL 0081 "1nosig/1badsig/1othercode/1old/1paused" | PASS | PASS |
| 43 | A bot fills the hidden box | Answered as sent, but no enquiry id, so no payment is ever made. | SQL 0081 "2bot" | PASS | PASS |

"Now" means the result in CI on the sweep's commit.

---

## 3. Bugs found and fixed

Each fix comes with a test that failed before it.

- **B1. Razorpay "authorized" counted as paid.** An authorized payment can still be dropped by the bank, so a member could be marked paid with no money. Now only "captured" counts. (W-05)
- **B2. A partner (Connect Razorpay) webhook could pay any gym's request.** Now the account in the event must belong to the same gym as the request. (W-13)
- **B3. The price changed between the form and the payment, and the old link stayed payable.** A person could pay both the old and the new link. Now the old link is checked first (if paid, it stands), and otherwise it is closed here and at the company. (W-17, W-18)
- **B4. The gym removed its payment account while links were open.** Money already paid was never learnt, and the links stayed payable. Now each open link is checked first, then closed at the company and here. (W-22)
- **B5. The Today row showed the plan price, not what was really paid.** Now it shows the paid amount, flags a mismatch, and Approve asks before saving. (D-02, D-03)
- **B6. A paid join that was never approved had no receipt and nobody was told.** This happened when the plan was deleted and "Make member" was used instead, or when the save failed, or on a second payment. Now it is shown in "Paid online, receipt not made", or quietly healed when the receipt already exists. (D-05, D-06, e2e)
- **B7. UPI "I have paid" was approved in one tap, with nothing checked.** Now Approve asks "Can you see ₹X from NAME in your bank or UPI app?" first. (D-02, e2e)
- **B8. Test-mode payments became real receipts.** This happened through Approve, the desk link sheet and the receipts sweep, and the Shop also said "Paid online" for them. Anyone can "pay" a test link with a test card, so this showed money that never came in. Now a test payment never makes a receipt. The member and the plan are still made, and the desk is told "no real money came in". (D-01, D-04, W-32, e2e)
  - This is a policy choice and can be undone: one function, `isRealMoney`, plus the Shop's SQL line.
- **B11. Once live, a test connection could still make links for real members.** Now only a connection in the Worker's own mode makes links. (W-26)

---

## 4. Known limits (tested where possible, written down where not)

- **A second payment on a fee request** is only logged on the Worker. For join requests, the desk sees the second paid row (D-06). For fees, nothing on screen shows it yet.
- **Cashfree partner webhooks without a hook id are ignored.** None are used, because every Cashfree link carries the gym's own `notify_url`.
- **PayU has no "cancel link".** An old PayU link stays payable until it runs out. A payment on it is still learnt and recorded as late. PhonePe links run out within an hour.
- **Disconnect checks at most 25 open links** with the company. Any beyond that are only closed here.
- **No refund webhook.** Refunds are done by the gym at its company, and then the receipt is voided by hand (row 33).
- **A real test-mode run against the companies' sandboxes is not possible yet.** CI has no Razorpay or Cashfree test keys. Every company call in these tests is a faithful fake of the documented API: paths, signatures, paise or rupees, and statuses.

To run against the real sandboxes, the owner must create test keys and add them as GitHub secrets:
- Razorpay test mode: `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET`
- Cashfree sandbox: `CASHFREE_TEST_APP_ID`, `CASHFREE_TEST_SECRET_KEY`

A workflow can then make, check and cancel a real test link.
