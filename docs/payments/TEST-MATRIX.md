# Gym payments: the money flow and the test matrix

Payment sweep R-542, 14 Nov 2026. Review round 2 fixes, same day (rows 44 to 56, bugs R2-1 to R2-6). Owner's decision A and the first real Razorpay test-mode run, same day (rows 57 to 59). Review round 3 fixes, same day (rows 60 to 71, bugs R3-1 to R3-7). Scope: every path where money moves for a gym.

- **New (not deployed yet):** paying online when joining, from the join link or the gym web page.
- **Existing:** F79 member payments, which use the gym's own Razorpay or Cashfree account (PayU and PhonePe only for a gym already on them, R-547), or its plain UPI ID. This covers links, webhooks, receipts and the shop.

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
   - **Check.** The Worker asks the company's own status API when the page or the desk asks, when Today's "Joined online" loads (up to 10 of that gym's unpaid join payments per look), and every 10 minutes by itself (40 asks a run, open links first). Only a Razorpay payment that is **captured** counts; "authorized" alone does not. Each link is asked with keys of its **own** mode (test or live), never the other.
   - **Links we closed stay watched.** When we close a link (a price change, the desk's cancel, Make member, a disconnect), the company may still take money on it: PayU cannot cancel a link, PhonePe's page lives up to an hour, and a cancel can fail on a network error. So every closed link with a company link id is still asked about, every 30 minutes, for 8 days, until the company itself says it is closed. A payment found on it is recorded as paid late. After a disconnect, pasted keys are kept sealed and switched off (they never make a link) only while such a link needs watching, then wiped.
7. **Paid is recorded once.** `markPaid` writes a `pay_events` row keyed by (company, payment id). A second webhook, a webhook plus a check, or a second payment on the same request never pays twice. The amount recorded (`paidP`) is what the company says was paid, never the asked amount. When one side knows only that the link was paid (a `<link>:paid` id) and the other names the payment, that is the same payment: the real id is kept and nothing is logged as "refund it".
8. **UPI "I have paid".** With a plain UPI ID nobody can verify the payment, so the tap only marks the request `said`. It is never paid. The desk must look in its bank or UPI app.
9. **The desk approves.** On Today, the "Joined online" row shows what was really paid. Pressing Approve:
   - asks first, with the amount, for a UPI payment nobody has confirmed, or when the paid amount is not the plan;
   - asks the company once more, right then: a payment refunded since is not saved ("This online payment was refunded, so nothing was saved");
   - takes a 5-minute claim, so two desks cannot both record it;
   - makes the member and the plan, and saves a receipt with `requestId = pay-<request id>` (the store saves one receipt per requestId, so pressing twice gives one receipt);
   - tells the Worker it was recorded.

   **A test-mode payment never becomes a receipt.** The member and the plan are made and the fee stays due.
   **Make member** (for someone who has not paid online) first closes their open online payment: the Worker asks the company, keeps a payment made a moment ago ("has just paid online. Tap Approve instead"), and cancels the link at the company too.
10. **The safety net.** The receipts sweep ("Paid online, receipt not made") shows the desk any real paid join that nobody approved, and any second paid row, so no money is silently lost. For a join made a member without Approve it says they may have paid twice: check, and refund one if so.

### Member fees and the shop (existing, F79)

Members pay with the same pieces. The desk makes a link for a membership's due amount, or the member app makes one for a shop order. The amount comes from the gym server's own records, never the browser. Then the same signature checks, the same `markPaid` and `pay_events`, and the same claim plus requestId apply.

The receipts sweep makes a receipt by itself only when:
- the membership is still there,
- the amount is not more than what is due, and
- the payment is real (not test mode).

The shop's "Paid online" marker also ignores test payments. When a shop order's total changes, or the desk cancels a link, the old link is asked once (a payment is kept) and cancelled at the company too, not only here. A link made in the other mode (a test link from before payments went live) is never handed out again: it is asked once and closed.

Review round 3 (R-550):
- **The desk takes the money another way.** Before "Save payment" (cash, card, or UPI to the gym's own QR) and before a shop order's "Collected (paid)", the admin app asks the Worker to close every open online link for that due or order, here and at the company. If one was paid a moment ago, nothing is saved and the desk is told "has just paid online". The same happens when the desk changes a due's amount and makes a new link: the old link is closed first.
- **Only the owner sets the gym's UPI ID** on the Worker (it goes on members' shop QR and the join page). A staff login's UPI ID is ignored, and the admin app no longer sends one.
- **New keys for another account.** When the owner pastes keys of a different Razorpay or Cashfree account, every open link of the old account is asked with the old keys, closed there, and the old keys are kept sealed (off) only to keep watching those links and to check their webhooks. Keys of the same account (or new keys made for it) close nothing.
- **Each link is watched until its own expiry plus a day** (and never less than 8 days from the request), so a link made late for an old request is still found when paid.
- **One run never passes Cloudflare's limit.** The 10-minute check, Today's "Joined online" and disconnect each stop before 40 calls to the payment company (Cloudflare's free plan allows 50 per run). The 10-minute check asks the links asked longest ago first, so every link, open or closed, gets its turn.

### Refunds

There is no refund call. The gym refunds in its own company dashboard, then voids the receipt on the member's page. A voided receipt keeps its number, puts the money back on the member's tab, and is left out of every total.

---

## 2. The matrix

| # | Angle | What must happen | Test that proves it | Before | Now |
|---|---|---|---|---|---|
| 1 | Paid | Paid once. The page, the desk and the company show the same amount. | W-01; pay.test.mjs "a request makes a Razorpay link..."; joinPay.test.mjs "a company link for the gym server price..."; e2e "R-528 page: online on (test mode)..." | PASS | PASS |
| 2 | Failed | The failure is shown. The request stays open and payable and is never paid. | W-02; pay.test.mjs "failed try keeps the link open..."; joinPay.test.mjs "a failed or abandoned payment..."; e2e "R-528 page: a payment that fails..." | PASS | PASS |
| 3 | Cancelled at the company | Closed and not paid. A payment that still arrives later is recorded as late. | W-03/W-04 (these call markPaid directly); the path that really reaches it for a closed link: W-33, W-34, W-35 (rows 44 to 46); pay.test.mjs "...a payment after a cancel is still recorded (late)" | PASS | PASS |
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
| 15 | Webhook not JSON, or for an unknown request; a signed "paid" with no payment id | Answered 200 and nothing changes. A signed "paid" with no payment id (round 2) is paid once under the link's id, the same id the check uses, so the two never look like two payments. | W-15 | PASS | PASS |
| 16 | Amount tampered in the browser | Every amount the page sends is ignored, on Send, on the check and on "I have paid". | W-16; selfJoin.test.mjs (the amount only from the server's `totalP`) | PASS | PASS |
| 17 | Plan price changed between the form and the payment | The old link is closed, here and at the company, before a new one is made. | W-17 | **FAIL (B3)** | PASS |
| 18 | Price changed, but the old link was already paid | No new payment. The paid one stands. | W-18 | **FAIL (B3)** | PASS |
| 19 | Rounding (paise / rupees) | Cashfree is in rupees both ways, Razorpay in paise. Odd paise survive. The page, the UPI `am=` and the desk use one format. | W-19; D-07; uatMoney.test.ts "three instalments of an odd total settle it to the paisa" | PASS | PASS |
| 20 | GST-free totals | No GST or other charge is added. The link amount is exactly plan price plus joining fee. | W-20; SQL 0077 "1total/3total" (= price + fee); SQL 0081 "2total" | PASS | PASS |
| 21 | Switch turned off mid-flow | New joins pay at the desk. A payment already started is still learnt. | W-21; joinPay.test.mjs "pay-info: online only with ... the switch on"; e2e "Settings -> Payments, the two switches" | PASS | PASS |
| 22 | Payment account removed mid-flow | Open links are checked first, and any paid one is kept. The rest are closed at the company and here. Pasted keys are kept sealed and off only while a closed link still needs watching (row 46), then wiped. | W-22; W-35; pay.test.mjs "disconnect wipes the sealed keys..." | **FAIL (B4)** | PASS |
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
| 39 | Logs hold no card, phone or secret | No card, phone, name, UPI ID, key, secret, proof or amount in any log line. No payment request id either (row 55). | W-31; W-44; pay.test.mjs "connect: ... never answered back" | PASS | PASS |
| 40 | Keys stored safely | Sealed with AES-GCM. The plain text never shows. A wrong key or a changed byte fails. | pay.test.mjs "seal and unseal: round trip..." | PASS | PASS |
| 41 | Server part not ready | Every call says NOT_READY. The page is the desk page. | pay.test.mjs "tables missing..."; e2e "R-528 page: before the server part is live..." | PASS | PASS |
| 42 | Gym server signature for the gym id | Only a fresh (at most 5 minutes old) Worker signature for this code works. A paused gym is CLOSED. | SQL 0081 "1nosig/1badsig/1othercode/1old/1paused" | PASS | PASS |
| 43 | A bot fills the hidden box | Answered as sent, but no enquiry id, so no payment is ever made. | SQL 0081 "2bot" | PASS | PASS |
| 44 | PayU gym, price changed: we close the old invoice here (PayU cannot cancel it), they pay it from the old tab, no webhook | Still watched: the 10-minute check finds it, paid late, and Today shows "Paid online", so the desk does not charge again. | W-33 | **FAIL (R2-1)** | PASS |
| 45 | Razorpay cancel fails on a network error (price change) | The link may still be payable there, so it stays watched; a payment on it is found. | W-34 | **FAIL (R2-1)** | PASS |
| 46 | Disconnect while a link is payable and its cancel fails | Pasted keys kept sealed and off (never making a link) only until it is settled; the payment is found; then the keys are wiped. | W-35; W-22 | **FAIL (R2-1)** | PASS |
| 47 | Which links stay watched | Open ones; ones we closed, for 8 days; never once the company says closed, once paid, or with no company link. | W-36 | **FAIL (R2-1)**, nothing watched them | PASS |
| 48 | Paid at home a minute ago, walks in, the desk is about to take cash | Today asks the company itself when it loads and shows "Paid online", not up to 10 minutes later. | W-37; W-45 | **FAIL (R2-2)** | PASS |
| 49 | Make member while the online link is still open | The link is closed at the company first. Paid a moment ago: "{name} has just paid online. Tap Approve instead." and no form opens. | W-38; D-08; e2e "R-542 round 2 phone: Make member closes the open online payment first..." | **FAIL (R2-2)** | PASS |
| 50 | "Paid online, receipt not made" for a join made a member without Approve | Says they may have paid twice: check, and refund one if so; only otherwise save it. | e2e "R-542 phone: ... a paid join nobody approved is shown" | **FAIL (R2-2)**, it nudged a second receipt | PASS |
| 51 | Shop order total changed; the desk cancels a link | The old link is cancelled at the company too. One already paid stands, and no new link is made. | W-39; W-38 | **FAIL (R2-4)** | PASS |
| 52 | A test link after payments go live | Never reused (fee, shop, join); never asked with live keys; can never switch live payments off as "bad keys". | W-40 | **FAIL (R2-3)** | PASS |
| 53 | Refunded (in full) before Approve | Approve asks the company once more: refunded, so nothing is saved, no member, no receipt. An open one paid a second ago is found then too. | W-41 (Razorpay); W-42 (Cashfree: full refund done or under way = refunded; part or cancelled refund = paid); e2e "R-542 round 2 phone..." | **FAIL (R2-5)** | PASS |
| 54 | One payment named two ways by the check and the webhook | One payment; the real id is kept; no false "the gym should refund it". Two real ids are still said as a second payment. | W-43; W-15 | **FAIL (R2-6)** | PASS |
| 55 | Payment request ids in server logs | Never (anyone holding one can tap "I have paid"). | W-44 | **FAIL (R2-6)** | PASS |
| 56 | Webhooks of gyms on pasted Razorpay keys, and of PhonePe gyms | Always refused: no webhook secret is collected for them. The payment is still found by the page, Today, the check before Approve and the 10-minute check. | W-45 | PASS (written down, not a bug) | PASS |
| 57 | Which payment companies a gym can pick (owner's decision A, 14 Nov 2026) | Exactly Razorpay and Cashfree, on the screen and in the server's list. PayU and PhonePe cannot be newly connected (refused even if asked directly). | W-46; pay.test.mjs "tables missing..."; dashboard pay.test.ts "R-547: the picker offers exactly Razorpay and Cashfree..."; e2e "F79 phone/computer: Settings -> Payments..." | **FAIL**, all four were offered | PASS |
| 58 | A gym already on PayU or PhonePe | Still shown and still working (links made, checked, watched); can paste new keys after "bad keys"; can disconnect. Once disconnected it is gone and cannot be connected again. | W-46; W-47; W-33 | PASS (kept working) | PASS |
| 59 | Our real Razorpay code against Razorpay's real test API | A Rs 1 link is made, Razorpay says "created" and we read it as open, not paid; cancelled, Razorpay says "cancelled" and we read it as cancelled, not paid, and stop asking; the 10-minute check agrees each time; a second cancel and an unknown link are refusals, not crashes; a wrong secret is "bad keys" and switches that connection off. Test keys only (refuses anything but rzp_test_). | ci.yml job "razorpay-test-mode" (deploy/panel/razorpayTestMode.check.mjs), push to main and by hand | new | PASS (real Razorpay, run 43609581939) |
| 60 | "Seen" and "paid" saved as two writes, and the second fails | One write: both or neither. The next report of the same payment still marks it paid. One left half done by the old code (seen, never paid) is healed by the next report. | W-48 | **FAIL (R3-1)**, the next report was "duplicate" and the request stayed open | PASS |
| 61 | A link made days after its request (a desk link on day 5 for a request of day 0), paid on day 9 | Still found: every link is watched until its own expiry plus a day, never less than 8 days from the request. | W-49 | **FAIL (R3-2)**, stopped watching on day 8 | PASS |
| 62 | More links than one 10-minute run can ask | Turns: the links asked longest ago go first, open or closed, so a closed link that is still payable is asked too. | W-50 | **FAIL (R3-3)**, closed links never got a turn | PASS |
| 63 | One run and Cloudflare's 50 outside calls | The 10-minute check, Today's "Joined online" and disconnect each stay within 40 calls (a paid Cashfree link costs 4). The rest are asked next time. | W-51; W-52 | **FAIL (R3-3)**, 160 calls in one 10-minute run, 51 in one disconnect | PASS |
| 64 | Disconnect with more open links than one run can ask | Within 40 calls. Every link is still cancelled at the company: those not reached are cancelled by the 10-minute check, with the kept (off) keys. | W-52 | **FAIL (R3-3)** | PASS |
| 65 | New keys of a DIFFERENT Razorpay account | The old account's open links are asked and cancelled with the old keys; one still payable is found with the old keys; new links use the new keys. | W-53 | **FAIL (R3-4)**, old links stayed payable and were asked with the wrong keys | PASS |
| 66 | The SAME account's keys pasted again, or new keys made for it | Nothing is closed; the open link still works. | W-54 | PASS (regression) | PASS |
| 67 | New keys of another Cashfree account | The old link is cancelled with the old keys, and a webhook for it signed with the OLD secret key is still accepted. | W-55 | **FAIL (R3-4)**, nothing cancelled, webhook refused | PASS |
| 68 | The desk takes cash or QR for a due or a shop order with an open link; or changes the amount and makes a new link | The old link is closed here and at the company. One paid a moment ago stands: nothing is saved and the desk is told "has just paid online". | W-56; dashboard pay.test.ts "R3-5 ..." | **FAIL (R3-5)**, the old link stayed payable | PASS |
| 69 | A staff login sends a UPI ID | Ignored by the Worker (the desk state still answers); the admin app sends none for staff; the owner still can. Settings hides the field from staff. | W-57; dashboard pay.test.ts "R3-6 ..." | **FAIL (R3-6)**, saved | PASS |
| 70 | Razorpay refund (full or part) before Approve | Read from the payment itself (`amount_refunded`, `refund_status`). Any refund means "not a payment to Approve": nothing is saved. | W-58; W-41 | **FAIL (R3-7)**, read only from the link, which has no refund fields | PASS |
| 71 | Cashfree part refund before Approve | Also not a payment to Approve (it was paid before). | W-42 | PASS (part refund counted as paid) | PASS |

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

### Review round 2 (14 Nov 2026)

- **R2-1. A payment on a link we had closed was never seen.** The status check and the 10-minute check only looked at open links. So on a PayU gym (PayU cannot cancel), after a Razorpay cancel that failed, on PhonePe's hour-long page, or after a disconnect (keys wiped), money paid on the old link never showed, and the desk could charge again. Now closed links with a company link id are still asked about every 30 minutes for 8 days, until the company says they are closed, and after a disconnect the pasted keys are kept sealed and off only for that. (W-33 to W-36, W-22)
- **R2-2. Today said "Not paid" for up to 10 minutes after the money came, and Make member left the online link open for 7 days.** Someone could pay at home, walk in, and be charged cash too. Now Today asks the company itself when it loads; Make member closes the open link first (at the company too) and stops with "has just paid online. Tap Approve instead." if it was paid; the "receipt not made" card says they may have paid twice and to check and refund. (W-37, W-38, D-08, e2e)
- **R2-3. A test link could be reused after going live, and was asked with the live keys.** A "bad keys" answer to that would have switched the gym's live payments off. Now only a link of the current mode is reused (fee, shop, join), others are closed, and each link is asked only with keys of its own mode. (W-40)
- **R2-4. A shop order's changed total and the desk's cancel closed the link only on our side.** Now both use the same close step as the join flow: ask first, then cancel at the company. (W-39, W-38)
- **R2-5. A refund before Approve still became a receipt.** Now Approve asks the company once more; Razorpay and Cashfree full refunds stop it. (W-41, W-42, e2e)
- **R2-6. One payment could be logged as "a second payment, refund it", and payment request ids were in the logs.** Now a link-level id and the payment's own id count as one payment, and no log line holds a request id. (W-43, W-44, W-15)

### Review round 3 (14 Nov 2026)

- **R3-1. "Seen" and "paid" were two writes.** If the second failed, the payment was logged as seen but the request stayed unpaid, and every later report of it was ignored as a duplicate. Now they are one write (a D1 batch), and a row the old code left half done is healed by the next report. (W-48)
- **R3-2. Watching stopped 8 days after the request, not after the link.** A desk link made on day 5 for an older request can be paid until day 12. Now each link is watched until its own expiry plus a day. (W-49)
- **R3-3. One 10-minute run could pass Cloudflare's limit, and closed links could wait forever.** Open links always went first, so with many open links a closed one still payable was never asked; and one run could make 160 company calls (the free plan allows 50). Now runs stop before 40 calls and take turns by "asked longest ago". Disconnect does the same; the links it does not reach are cancelled at the company by the 10-minute check. (W-50 to W-52)
- **R3-4. New keys for another account left the old account's links payable.** They were never cancelled there, a payment on them was asked with the new keys (and missed), and a Cashfree webhook for them failed its signature. Now the old links are settled with the old keys, which stay sealed and off only for that. The same account's keys close nothing. (W-53 to W-55)
- **R3-5. Fee and shop links stayed payable after the desk took cash or QR, and a changed amount left two live links.** Now the old links are closed first, here and at the company; one paid a moment ago stops the desk's save. (W-56, dashboard pay.test.ts)
- **R3-6. Any staff login could change the gym's UPI ID** that members' shop QR and the join page pay to. Now only the owner's key can. (W-57, dashboard pay.test.ts)
- **R3-7. The Razorpay refund check before Approve was not proven.** It read refunds from the link, which carries none. Now it reads the payment itself, and any refund stops Approve. (W-58)

---

## 4. Known limits (tested where possible, written down where not)

- **A second payment on a fee request** is only logged on the Worker. For join requests, the desk sees the second paid row (D-06). For fees, nothing on screen shows it yet.
- **Cashfree partner webhooks without a hook id are ignored.** None are used, because every Cashfree link carries the gym's own `notify_url`.
- **PayU has no "cancel link".** When we close a PayU link (a price change, the desk's cancel, Make member, a disconnect), PayU still takes money on it until it runs out after 7 days. We keep asking PayU about it every 30 minutes for 8 days, so a payment on it is found and recorded as paid late (row 44). Until that ask, the old tab can still be paid; the person then shows as paid twice and the gym refunds one. PhonePe's page runs out within an hour and is watched the same way.
- **Webhooks of gyms on pasted Razorpay keys, and of PhonePe gyms, are always refused.** We never ask those gyms for a webhook secret, so a signature cannot be checked. Their payments are found by asking the company instead: the page, Today, the check before Approve, and the 10-minute check (row 56). Cashfree and "Connect Razorpay" webhooks work.
- **The 10-minute check makes at most 40 calls to the payment companies a run, for all gyms together** (about 10 to 40 links), the links asked longest ago first. With very many links a link may wait more than one run for its turn. Today asks up to 10 of its own gym's unpaid join payments each time it loads (also within 40 calls), so a gym's desk does not wait for that queue.
- **Cloudflare's limits** (https://developers.cloudflare.com/workers/platform/limits/): the free plan allows 50 outside calls (fetch) per run and 1,000 calls to Cloudflare's own services, which is where that page counts D1. The D1 page (https://developers.cloudflare.com/d1/platform/limits/) instead says 50 queries per run on the free plan. One 10-minute run makes about 40 outside calls and up to a few hundred D1 queries. If the D1 page's 50 is what Cloudflare enforces, the panel Worker needs the paid plan (Workers Paid) before payments go live. On a paid plan, `PAY_SUBREQUESTS` raises the 40.
- **Disconnect asks and cancels open links with the company within 36 calls** (about a dozen links). Any beyond that are closed here, then asked and cancelled at the company by the 10-minute check with the kept (off) keys. For a "Connect Razorpay/Cashfree" gym, disconnect revokes our access at once, so its old links can no longer be asked about or cancelled.
- **New keys for another account:** we can tell "another account" only for Razorpay and Cashfree (they refuse another account's link). For PayU and PhonePe, new keys with a different key id are treated as another account. The old keys are kept for at most three key changes, and only while their links are watched.
- **Once the desk records cash for a due, its links are no longer watched.** If cancelling at the company failed, or on PayU (no cancel), a later payment on the old link is not found; the gym then sees it at its company and refunds it. A cancelled shop order does not close its link yet.
- **Refunds.** Before Approve, any refund at Razorpay or Cashfree, full or part, stops the receipt (R3-7). A chargeback or dispute is not seen, and neither is a PayU or PhonePe refund. The member-fee receipts sweep does not check for refunds. Refunds are done by the gym at its company, and then the receipt is voided by hand (row 33).
- **Only Razorpay is checked against the real company (row 59), and only in test mode.** A real test payment (someone paying the link) is not made: Razorpay's test checkout needs a person. So "paid", refunds and webhooks are still proven only against faithful fakes of the documented API (paths, signatures, paise or rupees, statuses). Cashfree is not checked against its sandbox yet; for that the owner would add `CASHFREE_TEST_APP_ID` and `CASHFREE_TEST_SECRET_KEY` as GitHub secrets.
- **PayU and PhonePe (R-547).** No new gym can pick them. Their server code stays, only so a gym already on one keeps working. They are not checked against the real companies.

## 5. Real Razorpay test-mode run (row 59)

First run: GitHub Actions run 43609581939, job "razorpay-test-mode", 14 Nov 2026, on commit 0c7799f9, with the owner's Razorpay Test Mode keys. All 19 checks passed. Razorpay's own answers:

| Step | Razorpay answered | We read it as |
|---|---|---|
| Our key check, then Razorpay's (list links) | keys accepted | connectable (a test key in live mode is refused by us) |
| Make a Rs 1 link | made, `plink_...`, with a pay page | open |
| Read it back | status "created", amount paid 0, no payments | open, not paid; the 10-minute check agrees |
| Cancel it | cancelled | - |
| Read it back | status "cancelled", amount paid 0, no payments | cancelled, not paid; the 10-minute check marks it done and stops asking |
| Cancel it again | refused | a refusal we handle (CANCEL_REFUSED), not a crash |
| Read a link that does not exist | refused | a refusal (STATUS_REFUSED), never paid |
| Wrong secret, at connect and at the status check | refused (401) | BAD_KEYS, not a crash; the 10-minute check switches that connection off as "bad keys" |

Not covered by this run: a real test payment (Razorpay's test checkout needs a person to pay), refunds and webhooks. Those stay proven against the fakes (section 4).
