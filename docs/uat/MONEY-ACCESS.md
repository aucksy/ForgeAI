# Money and access UAT (items 1 and 2) — 17 Oct 2026

## Update, work package 3 (17 Oct 2026, overnight): the findings are fixed

- **13 of the 14 findings are fixed, plus U-A1.** F-12 is kept on purpose: it is a question for the
  gym's accountant (see "Owner decisions" at the end).
- **Commit `d0fdd72`** on `main`. The server half is migration **`0021_receipt_rules.sql`**. It is
  **not applied to the live database yet**: the owner applies it. Until then the live server still
  behaves as described below; the admin app already refuses the same things itself.
- The two serious ones:
  - **F-02:** no receipt can be dated ahead, by anyone. The front desk can date one at most 31 days
    back (the same rule as a desk sale).
  - **F-03:** a saved receipt can no longer be edited by anyone, the owner included. The only change
    it takes is a cancel with a reason, and then a new receipt. Every change to a receipt row now
    leaves a history row (who, when, old and new values) that only the owner can read.
- CI run **38959049116** (`database` job green on `d0fdd72`): all 11 SQL files pass, and both finding
  lists print **"findings still open: none"**. The `check` job of that run stopped at another
  helper's mobile silent-catch (fixed in `1fe945e`). Run **38960371468** on `1fe945e` (which
  carries `d0fdd72`): **`database` and `check` both green** (admin app typecheck, 849 tests, build,
  page crawl).
- Each finding's status is in the findings table (section 2, "Not enforced anywhere").
- **Apply 0021 and deploy the admin app back to back.** An admin app from before this change does
  not know the new refusals: it reads one (for example a desk receipt dated 40 days back) as "no
  internet", keeps it and resends it before every later action, so that desk is stuck until the
  page is reloaded. The new admin app treats them as final and says them in words.

## In one minute (as found, before work package 3)

- **No gym can reach another gym's data.** In all 64 cells where gym B's owner tries gym A's
  members, plans, receipts, visits, enquiries, expenses, staff, orders, products, messages or
  settings, the server either refuses or changes nothing of gym A. That was the S1 risk. It is
  closed today.
- **The server, not just the screen, holds the front desk to its limits.** The desk cannot cancel,
  change or delete a receipt. It cannot give more than 10% off, skip a new member's joining fee,
  start a plan more than 31 days back, touch plans, expenses or gym details, or manage people.
- **14 gaps were found: 2 serious (S2), none S1.** Both serious ones are about cash control.
  The desk can date a receipt any day in the past, so cash taken today can vanish from today's
  count. And an owner can rewrite a saved receipt with no record of the old value.
- Nothing in the app or the database was changed. This is tests and this write-up only.

| Number | Value |
|---|---|
| Access-matrix cells asserted | **438** after work package 3 (was 412): 350 through functions and RLS policies, plus 88 direct table reads and writes (83 allow, 355 deny) |
| Gym B on gym A cells | **66, all deny**. The test checks this itself: a gym B "allow" in the table fails the file. |
| Server money checks | **61** in `uat_money.sql`, **72** in `0021_receipt_rules.sql` (new), plus **66** shop, message and gym-start checks in `uat_shop_orders.sql` |
| Findings re-run on every CI run (probes) | 13 server probes (F-01 to F-08), plus F-10 in the matrix. **All closed**: each probe now names the refusal that closes it. |
| Client money tests | **41** in `apps/dashboard/test/crm/uatMoney.test.ts` (was 26). Dashboard total: 849 passing; `tsc -b` exits 0. |
| CI | Work package 3: `database` **green** on run **38959049116** (job 117169180594), commit `d0fdd72`; `database` and `check` both **green** on run **38960371468** (jobs 117173614745, 117173614992), commit `1fe945e`. Before: run 38954484673, commit `bbd6ba4`. |

The CI lines, as printed:

```
ok supabase/tests/uat_access_matrix.sql: RESULT PASS (412 cells: 84 allow, 328 deny; 64 gym-B-on-gym-A cells all deny; 72 direct-table cells; by actor {"anon": 104, "deskA": 62, "deskA2": 6, "ownerA": 57, "ownerB": 61, "memberA": 68, "pOwnerA": 3, "pOwnerB": 3, "pMemberA": 8, "signedIn": 40}; findings still open: F-10)
ok supabase/tests/uat_money.sql: RESULT PASS (61 checks, 13 finding probes; findings still open: F-01 F-02 F-03 F-04 F-05 F-06 F-07 F-08)
ok supabase/tests/uat_shop_orders.sql: RESULT PASS (66 checks)
```

After work package 3 (run 38959049116, commit `d0fdd72`):

```
ok    supabase/tests/0021_receipt_rules.sql: RESULT PASS (72 checks)
ok    supabase/tests/uat_access_matrix.sql: RESULT PASS (438 cells: 83 allow, 355 deny; 66 gym-B-on-gym-A cells all deny; 88 direct-table cells; by actor {"anon": 114, "deskA": 64, "deskA2": 6, "ownerA": 59, "ownerB": 63, "memberA": 70, "pOwnerA": 3, "pOwnerB": 3, "pMemberA": 8, "signedIn": 48}; findings still open: none)
ok    supabase/tests/uat_money.sql: RESULT PASS (61 checks, 13 finding probes; findings still open: none)
```

## Files

| File | What it proves |
|---|---|
| `supabase/tests/uat_access_matrix.sql` | The role × gym matrix below. All cells come from one list. Each cell runs as the actor's own database role, is checked, then undone. |
| `supabase/tests/uat_money.sql` | The money rules the server owns. The findings run as probes: each is tried, then undone, and stays "open" while the server still accepts it. |
| `supabase/tests/uat_shop_orders.sql` | Order moves and restock; member cancel; messages (withdraw, seen counts, late joiner, member who left); the fields in the invite preview; both ways to start a gym. |
| `apps/dashboard/test/crm/uatMoney.test.ts` | The money rules only the admin app enforces. Tests named `FINDING F-xx` pin today's behaviour of a gap; `FIXED F-xx` tests assert the rule once it is closed. |
| `supabase/tests/0021_receipt_rules.sql` | Work package 3: every 0021 refusal at its edge, the receipt history (who, when, old and new, owner-only), the private creator IP, the dropped F-14 policy. |

All three SQL files follow the existing convention. Each prints one `RESULT PASS ...` line and always
ends in an error, so it leaves nothing behind on the live database either. A finding never turns CI
red. Instead, the RESULT line lists which findings are still open. When a later fix closes one, it
drops out of that list.

## 1. The access matrix

**Actors.** Every gym-side caller reaches the database as the `anon` role, with a key inside the call:

- `anon`: no key.
- `memberA`: an app member of gym A.
- `deskA`: the front desk of gym A.
- `ownerA`: an owner of gym A.
- `ownerB`: an owner of gym B.
- `deskA2`: a second desk person, used to prove that a signed-out or removed key stops working.

The old sign-in-account path (0001; the mobile app's workout summaries) uses the `authenticated` role:

- `signedIn`: signed in, with no gym.
- `pMemberA`, `pOwnerA`, `pOwnerB`: profiles in gym A, gym A and gym B.

**Cell values.**

- `ALLOW`: no error, and gym A's data was read or changed.
- `deny CODE`: the call raised that code.
- `deny PERM`: the database refused the role.
- `deny (nothing of A)`: no error, but nothing of gym A was read or changed. For example, gym B's owner writing a row with gym A's id lands in gym B.
- `·`: that actor has no such path.

**Which test proves it.** Every cell is a row of the cells list in `uat_access_matrix.sql`, with the
same entity and action label. A failing cell prints that label, what came back, and the database's own
message.

| Entity | Action | Path | anon | memberA | deskA | ownerA | ownerB | deskA2 | signedIn | pMemberA | pOwnerA | pOwnerB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| member | C | `crm_push` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| member | C (app member) | `member_join, public join code` | ALLOW | · | · | · | · | · | · | · | · | · |
| member | R | `crm_pull` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| member | U | `crm_push` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| member | D (imported) | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny INVALID | · | · | · | · | · |
| member | D (typed by hand) | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | deny INVALID | deny INVALID | · | · | · | · | · |
| member | D (erase my cloud data) | `delete_my_cloud_data` | deny PERM | · | deny PERM | · | · | · | · | deny (nothing of A) | · | · |
| member | D (own sign-in profile) | `delete_my_cloud_data` | · | · | · | · | · | · | · | ALLOW | · | · |
| member | R (workout summaries) | `table member_summary (RLS)` | deny (no rows / PERM) | · | · | · | · | · | deny (nothing of A) | deny (nothing of A) | ALLOW | deny (nothing of A) |
| member | C (own summary, own gym) | `table member_summary (RLS)` | · | · | · | · | · | · | · | ALLOW | · | · |
| member | C (own summary, other gym) | `table member_summary (RLS)` | · | · | · | · | · | · | · | deny PERM | · | · |
| member | U (own role to owner) | `table profiles` | · | · | · | · | · | · | · | deny PERM | · | · |
| plan | C | `crm_push` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| plan | R | `crm_pull` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| plan | U (price) | `crm_push` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| plan | D (imported) | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny INVALID | · | · | · | · | · |
| plan | D (typed by hand) | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | deny INVALID | deny INVALID | · | · | · | · | · |
| membership | C (sell a plan) | `crm_push` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| membership | R | `crm_pull` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| membership | U (move the end: extra days) | `crm_push` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| membership | U (cancel) | `crm_push` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| membership | U (undo a cancel) | `crm_push` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| membership | D (imported) | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny INVALID | · | · | · | · | · |
| membership | D (typed by hand) | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | deny INVALID | deny INVALID | · | · | · | · | · |
| payment | C (collect) | `crm_push` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny WRONG_PLAN | · | · | · | · | · |
| payment | R | `crm_pull` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| payment | U (change the amount) | `crm_push` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | deny RECEIPT_LOCKED (F-03 fixed) | deny WRONG_PLAN | · | · | · | · | · |
| payment | U (cancel = void) | `crm_push` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny WRONG_PLAN | · | · | · | · | · |
| payment | U (cancel with no reason) | `crm_push` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | deny NEED_REASON (F-06 fixed) | deny WRONG_PLAN | · | · | · | · | · |
| payment | U (undo a void) | `crm_push` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | deny RECEIPT_LOCKED (F-03 fixed) | deny WRONG_PLAN | · | · | · | · | · |
| payment | R (change history) | `owner_receipt_history` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| payment | D (imported) | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny INVALID | · | · | · | · | · |
| payment | D (typed by hand) | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | deny INVALID | deny INVALID | · | · | · | · | · |
| visit | C (desk check-in) | `crm_push` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| visit | C (QR self check-in, own gym) | `member_check_in` | deny BAD_KEY | ALLOW | deny BAD_KEY | deny BAD_KEY | deny BAD_KEY | · | · | · | · | · |
| visit | C (QR check-in, other gym's code) | `member_check_in` | · | deny (nothing of A) | · | · | · | · | · | · | · | · |
| visit | R | `crm_pull` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| visit | U | `crm_push` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| visit | D (take back) | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| enquiry | C | `crm_push` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| enquiry | R | `crm_pull` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| enquiry | U | `crm_push` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| enquiry | D | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | deny INVALID | deny INVALID | deny INVALID | · | · | · | · | · |
| expense | C | `crm_push` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| expense | R | `crm_pull` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| expense | U | `crm_push` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| expense | D | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| staff | C | `owner_add_person` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| staff | R | `owner_people` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| staff | U (make a sign-in code) | `owner_make_signin_code` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny GONE | · | · | · | · | · |
| staff | U (sign out every device) | `owner_sign_out_person` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny GONE | · | · | · | · | · |
| staff | D (remove) | `owner_remove_person` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny GONE | · | · | · | · | · |
| staff | key works before (control) | `crm_pull` | · | · | · | · | · | ALLOW | · | · | · | · |
| staff | R after signed out | `crm_pull` | · | · | · | · | · | deny BAD_KEY | · | · | · | · |
| staff | C after signed out | `crm_push` | · | · | · | · | · | deny BAD_KEY | · | · | · | · |
| staff | R after removed | `crm_pull` | · | · | · | · | · | deny BAD_KEY | · | · | · | · |
| staff | C after removed | `crm_push` | · | · | · | · | · | deny BAD_KEY | · | · | · | · |
| staff | U after removed (orders) | `owner_set_order_status` | · | · | · | · | · | deny BAD_KEY | · | · | · | · |
| shop order | C (place) | `member_place_order` | deny BAD_KEY | ALLOW | deny BAD_KEY | deny BAD_KEY | deny BAD_KEY | · | · | · | · | · |
| shop order | C (with gym B's product) | `member_place_order` | · | deny GONE | · | · | · | · | · | · | · | · |
| shop order | R (own) | `member_orders` | deny BAD_KEY | ALLOW | deny BAD_KEY | · | deny BAD_KEY | · | · | · | · | · |
| shop order | R (another member's) | `member_orders` | · | deny (nothing of A) | · | · | · | · | · | · | · | · |
| shop order | R (gym list) | `owner_orders` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| shop order | U (move on: ready) | `owner_set_order_status` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny GONE | · | · | · | · | · |
| shop order | U (gym cancels) | `owner_set_order_status` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny GONE | · | · | · | · | · |
| shop order | U (member cancels own) | `member_cancel_order` | deny BAD_KEY | ALLOW | deny BAD_KEY | deny BAD_KEY | deny BAD_KEY | · | · | · | · | · |
| shop order | U (member cancels another's) | `member_cancel_order` | · | deny GONE | · | · | · | · | · | · | · | · |
| shop order | D | `no function; table only` | deny PERM | · | · | · | · | · | deny PERM | · | · | · |
| shop product | R (member shop) | `member_products` | deny BAD_KEY | ALLOW | deny BAD_KEY | · | deny BAD_KEY | · | · | · | · | · |
| shop product | R (gym B's shop) | `member_products` | · | deny (nothing of A) | · | · | · | · | · | · | · | · |
| shop product | R (panel) | `owner_products` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| shop product | U (restock) | `owner_add_stock` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny GONE | · | · | · | · | · |
| shop product | D | `owner_delete_product` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| message | R (inbox) | `member_messages` | deny BAD_KEY | ALLOW | deny BAD_KEY | · | deny BAD_KEY | · | · | · | · | · |
| message | R (gym B's message) | `member_messages` | · | deny (nothing of A) | · | · | · | · | · | · | · | · |
| message | U (mark gym B's message seen) | `member_saw_messages` | · | deny (nothing of A) | · | · | · | · | · | · | · | · |
| message | C (send) | `owner_send_message` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| message | D (take back) | `owner_withdraw_message` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny GONE | · | · | · | · | · |
| gym settings | R (panel) | `owner_gym` | deny BAD_KEY | deny BAD_KEY | ALLOW | ALLOW | deny (nothing of A) | · | · | · | · | · |
| gym settings | R (member app) | `member_me` | deny BAD_KEY | ALLOW | deny BAD_KEY | · | deny BAD_KEY | · | · | · | · | · |
| gym settings | R (invite link preview) | `gym_preview` | ALLOW | · | · | · | · | · | · | · | · | · |
| gym settings | U (rename) | `owner_rename_gym` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| gym settings | U (brand) | `owner_set_brand` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| gym settings | U (gym details record) | `crm_push kind gym` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | ALLOW | deny (nothing of A) | · | · | · | · | · |
| gym settings | D (gym details record) | `crm_push x:true` | deny BAD_KEY | deny BAD_KEY | deny OWNER_ONLY | deny INVALID | deny INVALID | · | · | · | · | · |
| gym settings | R (gyms row) | `table gyms (RLS 0001)` | deny (no rows / PERM) | · | · | · | · | · | deny (nothing of A) | ALLOW (name, code, brand; no IP since 0021, F-10 fixed) | ALLOW | deny (nothing of A) |
| gym settings | U (gyms row) | `table gyms (RLS 0001)` | deny (no rows / PERM) | · | · | · | · | · | deny (nothing of A) | deny (nothing of A) | deny (no update rule since 0021, F-14 fixed) | deny (nothing of A) |

Gym B's owner naming gym A's receipt ids now gets `deny WRONG_PLAN` instead of `deny (nothing of A)`:
the push would make a NEW receipt in gym B, and gym B has no such membership. Either way nothing of
gym A is touched.

**Direct table access (no function): 88 cells** (72 before work package 3). These cover the tables behind every entity:
`crm_records`, `gym_members`, `gym_staff`, `gym_sessions`, `gym_owner_keys`, `shop_orders`,
`shop_products`, `gym_messages` and `gyms`, and since 0021 `receipt_history` and `gym_creator_ips`. Create, read, update and delete were each run twice: as
`anon` (which every key actor is) and as `signedIn`. All 88 are denied. Every closed table refuses
with PERM. On `gyms`, the row-level rules either show and change no rows, or refuse with PERM.

**What the matrix shows by design (not defects):**

- The front desk can read everything, expenses included. The whole gym is downloaded to every
  signed-in device (`permissions.ts`, "HONEST LIMIT"), so hiding things from the desk is
  screen-only.
- The front desk may move shop orders on and cancel them. This is by design (0018: "Orders ... stay
  open to Staff").
- Anyone with the printed join code can join as an app member and see the gym's name and brand.
- Nobody can delete a member, plan, membership, receipt or enquiry that was typed in by hand, not
  even the owner. Only check-ins, expenses and records that came from an import can be deleted.

## 2. Money rules: who enforces what

### Server-enforced and tested

| Rule | Test |
|---|---|
| Nobody can delete a typed-in receipt (desk: OWNER_ONLY; owner: INVALID), and the row stays unchanged. | `uat_money.sql` 1a-1c; matrix payment D |
| A cancelled (voided) receipt keeps its row, number, amount and reason. The panel still downloads it, and it cannot be deleted afterwards. | 5a-5e |
| The front desk cannot cancel a receipt or undo a cancel. | 2h, 5d; matrix payment U |
| The front desk cannot change any field of a saved receipt (amount up or down, member, plan, number, date, method). Sending the same receipt again is harmless. | 2a-2j |
| A new desk receipt is a whole number of paise above zero. It cannot be 0, minus, a fraction, text or missing, and it cannot be created already cancelled. | 3a-3j |
| The server stamps who took the money from the session, and a later cancel keeps that name. | 3i, 5f (and `0019_*.sql`) |
| Replaying a push (the answer was lost) gives one receipt. The same push id with other rows writes nothing. The same receipt id in a new push updates the same row. | 4a-4g |
| When two desks work from one snapshot, the older push is refused (STALE), so two receipts cannot take the same number. | 4h-4i |
| Undo import: only the owner can do it. The row is kept with its data and cannot be deleted twice. The desk cannot bring it back. The import mark cannot be added or removed. | 6a-6h (and `0017_*.sql`) |
| Desk discount: at most 10% off, rounded in the gym's favour (₹999.99 → ₹900.00), with no minus or text price. A new member pays the joining fee; a renewal may skip it. The owner may give any discount. | 7a-7k |
| A desk sale starts at most 31 days back. | 7l-7m |
| The desk cannot change a sold price or fee. | 7n-7o |
| The server reads shop prices and stock itself. A cancel restocks once. Collected and cancelled orders are final. | `uat_shop_orders.sql` 1-2 |

### Client-only (the admin app; tested by vitest)

| Rule | Test file |
|---|---|
| Paid + due = price, in whole paise, through a sale, a part payment, a cancel and the final payment. | `uatMoney.test.ts` (also `collections.test.ts`, `local.test.ts`) |
| Receipt numbers have no gaps per gym per financial year and restart on 1 April. A late March entry continues March's series. Cancelled numbers are never reused. Imports get their own `IMP/` series. | `uatMoney.test.ts`, `receipts.test.ts` |
| A double press (no internet, pressed again) makes one receipt. | `uatMoney.test.ts`, `auditC7*.test.ts` |
| A sale cannot take more than its total. | `uatMoney.test.ts`, `selling.test.ts` |
| Collect no more than is due. | Since work package 3: the data layer (`local.ts`, run by the online store too) and the server (0021 `OVER_DUE`). `uatMoney.test.ts` "FIXED F-01". |
| "Collected" on the Money screen = the export's Amount column = the sum of live receipts. The splits by method and by day add up to the same total. | `uatMoney.test.ts` |
| Amounts use lakh and crore (`₹1,00,000`, `₹99,99,999`, `₹1,00,00,000`, `₹1L`, "Rupees One Lakh Only"). | `uatMoney.test.ts`, `money.test.ts` |
| Days and financial years turn over at midnight India time: 23:59:59 IST on 31 March is 2025-26; 00:00 is 2026-27. | `uatMoney.test.ts`, `dates.test.ts` (CI pins TZ=Asia/Kolkata) |
| GST is taken out of the amount, not added on top. The rate goes from 18% to 5% on 22 Sep 2025, by the day paid, on the printed receipt too. CGST + SGST = the tax, to the paisa. SAC 999723. | `uatMoney.test.ts`, `gst.test.ts`, `receiptDoc.test.ts` |
| A receipt number fits GST Rule 46 (at most 16 letters, digits, `-` or `/`). | `uatMoney.test.ts` "FIXED F-11" (the 10,000th import is `IMP/26-27/10000`); the server refuses longer (0021) |
| The desk's 10% floor is the same number on screen and on the server. | `uatMoney.test.ts`, `selling.test.ts` |

### Not enforced anywhere (findings)

As asked, each expected failure is listed here rather than failing CI. Each row says what the
assertion would be once fixed. Today that assertion would fail, and the probe or the `FINDING` test
records that.

| Id | Sev | What happened | The assertion | Evidence | Status (work package 3) |
|---|---|---|---|---|---|
| F-01 | S3 | The server saves a receipt bigger than what is owed (₹10,000 on ₹400 due) from both desk and owner, and so does the store under the screens. The extra disappears from dues (which floor at 0) but counts in full in Collected. Only the Collect sheet's screen code refuses it. (= U-A5) | The server refuses a receipt over the term's remaining due. | probe F-01; vitest "FINDING F-01" | FIXED d0fdd72. Server `OVER_DUE` (price + joining fee − live receipts) and the data layer. An owner's imported receipt is not held to it (an old register is history). |
| F-02 | S2 | The front desk can date a receipt any day back (400 days, into last financial year) or ahead (30 days), both in the panel's own Collect sheet and on the server. Cash taken today but filed under an old date never shows in today's "Taken by" count, so the drawer still balances. | A desk receipt's `paidOn` must be today, or a few days back. | probe F-02 | FIXED d0fdd72. Server `BAD_DATE` (ahead, anyone) and `TOO_OLD` (desk, over 31 days); data layer, Collect sheet and Sell sheet say it in words. |
| F-03 | S2 | An owner can rewrite a saved receipt (amount, member, number) or undo a cancel, and nothing keeps the old values: there is no change log. RESEARCH's rule "every change leaves an audit row" is not met. | A changed receipt keeps its old values, or the edit is refused. | probe F-03; matrix payment U (ownerA ALLOW) | FIXED d0fdd72. A saved receipt is never edited, owner included (`RECEIPT_LOCKED`); only a cancel with a reason. `receipt_history` + trigger keep who, when, old and new for every change; owner-only read (`owner_receipt_history`). No screen edited a saved receipt, so nothing the panel does is refused. |
| F-04 | S3 | The server does not check an owner session's NEW receipt: minus amounts, fractions of a paisa and text all go through. Neither does the store below the screens. A bug or a tampered session could lower Collected without anyone noticing. | The server refuses owner receipts that are not whole and positive. | probe F-04; vitest "FINDING F-04" | FIXED d0fdd72. Server `BAD_AMOUNT` for every session; data layer too. |
| F-05 | S3 | The server accepts a second receipt with a number already used in the gym. Only the client's numbering, plus the STALE check, keeps numbers unique. | Receipt numbers are unique per gym (and per year) on the server. | probe F-05 | FIXED d0fdd72. Server `DUP_RECEIPT` (live receipts of the gym; an undone import's numbers may be used again). |
| F-06 | S4 | The server accepts a cancel with no reason. The panel always sends one. | A void needs a reason. | probe F-06 | FIXED d0fdd72. Server `NEED_REASON` (3+ letters); the data layer too; a second cancel keeps the first reason. |
| F-07 | S4 | The desk can sell a plan at a price with a fraction of a paisa (₹900.005). The due is then fractional, and the server refuses any fractional desk receipt, so the desk can never settle it exactly. | Sale price and fee are whole paise. | probe F-07 | FIXED d0fdd72. Server `BAD_PRICE` for plans and memberships, when a price or fee is set or changed; data layer too. |
| F-08 | S3 | The desk can save a receipt against a plan that does not exist, or one that belongs to another member. The money counts in Collected, but nobody's due goes down, so a member who paid can still be chased. | A receipt's plan exists and belongs to its member. | probe F-08 | FIXED d0fdd72. Server `WRONG_PLAN`; the data layer needs a membership of the same member. |
| F-09 | S3 | With "show cancelled" ticked, the downloaded Excel file's Amount column includes cancelled receipts (its Status column marks them). The accountant's column total is therefore more than Collected, by exactly the cancelled amount. The code that builds the export rows lives inside `Money.tsx`, so it has no direct test. | The export total equals Collected, or cancelled rows export as 0 or in a separate column. | vitest "FINDING F-09" | FIXED d0fdd72. Amount is 0 for a cancelled receipt; a new "Cancelled amount (INR)" column holds it; Status says why. The rows are built in `collections.ts` now, and tested. |
| F-10 | S3 | A signed-in account that joins a gym with its public code can read the whole gyms row, including the IP address the gym was created from (`creator_ip`). This is the mobile app's email sign-in, the 0001 path; `apps/mobile/src/cloud/session.ts` still calls `join_gym_by_code`. | A gym member reads only the gym's name and brand. | matrix probe F-10 (in the RESULT line) | FIXED d0fdd72. The IP moved to `gym_creator_ips` (database owner only); a trigger keeps it off the gyms row; `gym_create_online` counts there. The matrix probe reads null. |
| F-11 | S4 | The 10,000th imported receipt in one financial year gets the number `IMP/2026-27/10000`. That is 17 characters, over Rule 46's limit of 16. | Every receipt number is at most 16 characters. | vitest receipt-number test | FIXED d0fdd72. From the 10,000th: `IMP/26-27/10000` (15 characters); the server refuses over 16 (`BAD_RECEIPT_NO`). |
| F-12 | S4 (question) | The GST tax on a receipt is kept to the paisa (₹71.43 on ₹1,500), not rounded to the rupee. Section 170 rounds the tax payable in the GST return. Whether each receipt must also round is a question for the gym's accountant. | The tax on the receipt is in whole rupees, if the accountant says so. | vitest "FINDING F-12" | KEPT. Whether a receipt rounds its tax to the rupee is the accountant's call; added to the owner decisions. |
| F-13 | S4 | "Today" and receipt dates come from the PC's own time zone. The server's rules (desk 31 days, PT today, check-in day) use India time. A desk PC set to another time zone dates receipts by that zone. | The panel's day equals India's day, whatever the PC's time zone. | Not tested beyond the time zone CI pins | FIXED d0fdd72. `todayISO`, `dateISOFromEpoch`, `hourOfEpoch` are India time on any PC (tested with TZ=UTC and America/Los_Angeles); shop "today" and check-in times too. |
| F-14 | S4 | The old 0001 rule "an owner profile may update its gyms row" can never work. The table's logo check calls a function that signed-in users may not run (0005 revoke), so every direct update fails. The refusal is safe, but it is an accident: if that function is ever granted, such a profile could rewrite its gym's row (join code, record version) directly. | The policy is removed, or narrowed to the fields it is meant for. | matrix gym settings U (gyms row), pOwnerA = deny PERM ("permission denied for function _logo_url_ok") | FIXED d0fdd72. The policy is dropped. Safe: nothing updates gyms directly (the mobile app and the old dashboard only read it), and it could never work anyway. |

**Inventory items from other helpers, now covered.**

- **U-A4:** the matrix now asserts:
  - the desk cannot add a person or make a sign-in code;
  - the desk cannot push an expense or gym-details row, or undo a cancel;
  - the desk cannot call `delete_my_cloud_data`;
  - the desk can call `owner_set_order_status`, by design;
  - after sign-out or removal, the person's key is dead for reads and pushes.
- **U-G3:** these are now asserted in `uat_access_matrix.sql` and `uat_shop_orders.sql`:
  - a member cannot read another gym's shop or messages;
  - a member cannot cancel another member's order;
  - every owner order move, with its restock;
  - the cancel states are final;
  - gym B cannot move gym A's order.
- **U-A5** is F-01.
- **U-A1** (work package 3, FIXED d0fdd72): the printed receipt and its WhatsApp message say
  "Received by <name>", as the staff-rights text promises. An old receipt with no name says nothing.

## Owner decisions (from work package 3)

- **F-12, for the gym's accountant:** should each receipt round its GST to the whole rupee? Today
  the tax is kept to the paisa (Rs 71.43 on Rs 1,500 at 5%). Section 170 rounds the tax you PAY in
  the return; whether each receipt must also round is the accountant's call. Nothing changes until
  he says so.
- The product calls made overnight are listed in the work package 3 report (decide, ship, surface).

## How this was run

- CI starts a throw-away local Supabase, applies every migration, and runs every file in
  `supabase/tests`. The three new files ran there.
- Iterations on CI:
  - Run 38953590961: one cell wrong. The owner-profile gyms update is refused, which is F-14.
  - Run 38953994436: the cell now printed its database message.
  - Run 38954247092: an edit had changed two rows that shared the same text.
  - Run 38954484673: green.
- Locally, `npx tsc -b` exits 0 and `npx vitest run` passes 831 of 831 in `apps/dashboard`.
- Git: four commits straight to `main` (`53e2f4c`, `4328454`, `008f2bb`, `bbd6ba4`), staged by path
  only. The other session's `tools/exercise-anim` files were never touched.
