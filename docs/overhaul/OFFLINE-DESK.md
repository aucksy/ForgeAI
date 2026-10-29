# Offline front desk (owner #7): how the admin app works with no internet

Decided by the owner 18 Oct 2026 (#7, "keep the whole CRM working, save changes and sync when the
internet is back"), widened 29 Oct 2026 (R-185: power cuts happen, make as much as possible work).

| Step | What the desk can do with no internet | Since |
|---|---|---|
| 1 | The admin app opens from a copy kept on this device; every member, plan and due can be looked up | 22 Oct (live) |
| 2 | Check-ins are kept and sent later with their real time | 22 Oct (live) |
| 3 | Payments (dues), plans sold with their payment, new members, changes to a member's details | 24 Oct (built), live with the 25 Oct deploy |
| 3 finish | "Offline: N waiting to send" + "See what is waiting" list; over-paid note; server rule 0041 | 29 Oct, branch `feat/offline-desk-3` |

Needs the internet (greyed out, "Needs internet"): messages, staff and sign-in, branches, imports,
settings pages, plans, cancelling a receipt, archiving.

## Where things wait
`apps/dashboard/src/crm/data/outbox.ts`: one IndexedDB document per gym (`forgeai-outbox`), kept by
gym id, so signing out or a new sign-in never loses an unsent payment. Each item holds the exact
records the desk made (the payment with its id and printed number). Each item's id is also its push
id, so sending twice never saves twice (0011 push log, 0021 "the same receipt again is fine").
Sign-out is greyed out while anything waits.

## The receipt number design (never changes after printing)
- **Online**, receipts use the gym's normal series: `2026-27/0001` (a branch: `B2/2026-27/0001`).
- **Offline**, each desk device prints from **its own series**: `2026-27/D1-0001`, `2026-27/D2-0001` ...
  (a branch: `B2/26-27/D1-0001`). D1, D2 = the device's desk number.
- **The desk number is given once, while online**, the first time a payment sheet opens on that
  device. The device saves an enquiry record `deskseries-<n>` on the server. The server takes one
  save at a time per gym and refuses a save built on an old version, so two devices can never get
  the same number; claims are never deleted, so a number is never reused, even after a device is wiped.
  A device that never takes money never uses a number.
- **The counter** lives in the same IndexedDB document as the waiting items and is advanced in the
  same transaction that keeps the payment, so two tabs on one desk can never print the same number.
  It restarts each financial year (1 April) like the normal series.
- **Never renumbered.** The normal series never reads `D` numbers (its pattern does not match), and an
  offline number is sent exactly as printed. Only an ONLINE save that got no answer and was proven
  never saved may take the next normal number (its receipt was never printable: it showed
  "Not confirmed yet").
- **GST:** CGST Rule 46(b) allows several invoice series, each consecutive and unique in the financial
  year, at most 16 characters. Every spelling fits 16 (`logic/receipts.ts` offlineReceiptNo picks the
  first that fits; the server refuses longer, 0021).
- **No internet and no desk number yet:** the payment is refused in plain words ("Connect this device
  to the internet once so it can take payments offline"); check-ins still work.

## Conflicts when sending
| Case | What happens |
|---|---|
| A check-in for a member already checked in that day elsewhere | Not sent (one visit per member per day) |
| New member whose mobile another device added meanwhile | Both kept, never merged; ours marked; note "Check X: Y already has the same mobile number" |
| Member details changed here and on another device | Field by field; a field both changed goes to the later change; note says which won |
| Payment for a member created offline | The member keeps the id the device gave it, so the payment and check-in follow; a refused new member holds its payments back with it |
| Two desks took money for the same plan | The printed receipt is sent as is. Until 0041 is live the server refuses it (OVER_DUE): it stays on the device, shown on the bar, never in totals; the owner can save it as a cancelled receipt. After 0041: taken, and the desk sees "X has now paid Rs N too much ... ask the owner to check" |
| The desk clock was ahead | Waits until that day, or the owner sends it with today's date |
| Taken by a front-desk person, sent by another person | Waits for the taker or an owner (the server names the sender as taker) |

## Server rule 0041 (NOT APPLIED LIVE)
`supabase/migrations/0041_offline_desk_receipts.sql`, test `supabase/tests/0041_offline_desk_receipts.sql`
(18 checks; PASS on PGlite; FAILS 4 checks against the old 0021 rule, proving it tests the change).
A NEW receipt skips the "more than owed" check only when it says `offline: true`, its number ends in
`/D<n>-<4+ digits>`, and desk `<n>` of the same gym claimed its series. Every other receipt rule
stays. The migration number may need to move if another branch takes 0041 first.
