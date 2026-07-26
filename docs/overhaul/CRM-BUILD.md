# ForgeAI Gym CRM — build guide (Pillar 1)

**Started:** 2026-07-26 · **Lives in:** `apps/dashboard` · **Status:** P1 shipped, P2–P7 planned.

> **Owner directive, 2026-07-26.** The fieldwork gate in `VISION.md` (§8, locked decision 3 —
> "no platform code until the design-partner gym notes return") is **WAIVED**. The owner instructed:
> *"don't hold the crm on field work… just build one basis online research… a crm that does all
> they need it to do."* `FIELDWORK.md` is still the blank kit; the R1 corpus
> (`docs/overhaul/research/`, 37 agents, 51 fact-checks) is the evidence base instead.
>
> **What that costs us, recorded honestly:** the four questions the visit would have settled
> (D1 phone-vs-desktop, D2 the actual daily mess, D3 will members install the app, D4 willingness
> to pay) remain unanswered. Every design decision below that would have depended on one of them is
> marked **⚠ ASSUMPTION** with the reasoning and the cheapest way to falsify it. None of them are
> load-bearing enough that being wrong forces a rewrite — that was the constraint I designed under.

## Scope

`VISION.md` decision 2 locked a **narrow** scope: ~8 features, with an explicit NO to POS,
inventory, access-control hardware, payroll, multi-branch roll-ups, class-booking-first,
white-label per-gym apps, marketing-campaign builders, lead-scoring funnels and digital waivers.
The 2026-07-26 directive ("a CRM that does all they need") is read as **the complete day-to-day of
running the gym** — roster, plans, renewals, dues, attendance, staff, PT, reports — **not** as
reopening that NO list. Nothing on the NO list is being built.

## The decision that shaped the data model

The pre-existing cloud schema (`supabase/migrations/0001_init.sql`) keys members off
`auth.users`: `member_summary.member_id references auth.users(id)`. A member therefore only exists
once they have installed the app and signed up.

**A real value gym's roster is mostly people who never will** — walk-ins, cash payers at the desk,
older members. A CRM that cannot hold them is not a CRM. So:

- `Member` is a **gym-owned record that stands alone**, keyed by gym + phone.
- `Member.appUserId` links to an auth account **only if and when one appears**.
- Memberships, payments and visits hang off `Member.id`, never off an auth id.

This is additive to the existing schema — `member_summary` (what the phone pushes) is untouched and
folds back in during P7 as an "app activity" view joined on `appUserId`.

## Architecture

```
apps/dashboard/src/crm/
  types.ts              domain types (Member, Plan, Membership, Payment, Visit, views)
  logic/                PURE — no storage, no React, fully unit-tested
    money.ts            integer paise, INR formatting, strict rupee/count parsing
    dates.ts            'YYYY-MM-DD' calendar arithmetic
    membership.ts       end dates, state, the renewal coverage chain, dues, ranking
    members.ts          phone normalisation/validation, duplicates, search
    receipts.ts         Indian financial-year receipt numbering
    selling.ts          sale defaults + validation (extracted OUT of the form — see below)
  data/
    adapter.ts          the CrmData interface — the ONLY storage seam
    local.ts            browser-local adapter (one versioned JSON blob)
    demo.ts             deterministic demo gym, dated relative to today
  store.tsx             React context: load snapshot → mutate → re-read
  ui/                   shell, hash router, kit, screens, forms
  CrmApp.tsx            route table
```

### Three decisions made without fieldwork

| Decision | Reasoning | ⚠ How to falsify cheaply |
|---|---|---|
| **Responsive web, one codebase** — phone-first layout that becomes a desktop console at ≥861px | D1 is unanswered and the two candidate products are very different. Responsive is the only option that does not bet months on a guess: `AppShell` renders a genuinely different structure per width (bottom nav + cards vs sidebar + tables), not a squashed desktop | Watch which one the design-partner gym actually uses in the analytics we add at P7. Deleting the loser is a day's work |
| **Money as integer paise** | Floating-point rupees drift once you sum part-payments; this is a money product. Not reversible later without a data migration, so decided now | Not an assumption — arithmetic |
| **Local-first adapter alongside cloud** | The build machine cannot run Postgres (no Docker, 5.9 GB RAM), so without it the CRM could not be run or verified at all. It also doubles as the zero-signup sales demo and the offline path for a gym on bad broadband | — |

### Why a snapshot-in-memory model

A value gym is a few hundred members and a few thousand payments. Loading the whole gym once and
deriving every view from plain arrays keeps every list instant, keeps the derivations pure and
testable, and means no screen has to learn about pagination or query state before the cloud adapter
lands. Every write goes through the adapter and then **re-reads** the snapshot, so the UI can never
claim a payment was recorded when it wasn't.

### Rules the code enforces

- **Inclusive end dates.** `endsOn` is the LAST day a member may train. A 1-month term from 26 Jul
  ends 25 Aug; the renewal starts 26 Aug. No gap a member can be turned away on, no overlap the gym
  is paid twice for.
- **Month arithmetic clamps.** 31 Jan + 1 month = 28 Feb (29 in a leap year), so a term never spills
  into the month after next. Renewal chains settle on a stable anniversary rather than creeping.
- **Snapshots, not references.** A `Membership` copies the plan's name and price at the moment of
  sale. Raising prices tomorrow must not change a receipt printed today.
- **Append-only money.** Payments are never edited or deleted, only `voided` with a reason. Voided
  receipt numbers are consumed, never reissued — a gap in a receipt book is a question from an
  auditor; a duplicate is worse.
- **Coverage follows the chain.** A member's status reads the whole run of back-to-back terms, not
  just the one running today, so an early renewal immediately removes them from the chase list.
  Phoning someone who has already paid is the most annoying thing this product could do.
- **The chase list forgets.** Lapsed members drop off the daily action list after
  `WINBACK_WINDOW_DAYS` (45). A list that never forgets anyone is a list the owner stops opening.
  They stay findable forever under the roster's "Expired" filter.
- **Storage writes before it commits.** Every mutation builds the next snapshot, persists it, and
  only then adopts it in memory — so a failed write (quota, Safari private mode) leaves memory
  exactly as it was rather than holding records that were never saved and duplicating them on retry.
  Reads re-read whenever storage has moved underneath them, so a second browser tab cannot clobber
  the first or mint a duplicate receipt number.
- **Unreadable data is never overwritten.** A blob from a different schema version is backed up and
  **refused** (`FutureSchemaError`), not seeded over. A stale cached bundle must not be able to erase
  a gym.
- **Form logic lives in `logic/`, not in JSX.** Review found two real money bugs that existed only
  inside the sell form and were therefore untestable: a second renewal defaulting to a start date
  *inside* the renewal already sold, and a joining fee charged twice. Anything a form decides is now
  a pure function with tests.

## Known limits (recorded, not bugs)

- **No UI-render tests.** The lane is Node-only, so `src/crm/ui/**` is gated by `tsc`,
  `vite build` and manual browser checks. Mitigation: form *decisions* live in `logic/selling.ts`
  where they are tested. A jsdom lane is the obvious next hardening step.
- **`localStorage` has no compare-and-swap**, so the two-tab race is narrowed to the microtask
  between re-read and write, not closed. Real multi-user safety is what P7's Postgres adapter is for.
- **Plans can be retired, not deleted**, and receipt numbers are derived from the ledger rather than
  a stored counter (so a lost counter is always recomputable, and a back-dated receipt lands in the
  right financial year).

## Phases

| # | Phase | Status |
|---|---|---|
| **P1** | Roster spine — members, plans, sell/renew, dues, check-in, local adapter, test lane, CI gate | ✅ 2026-07-26 |
| P2 | Money — payment ledger UI, part-payment collection, receipts, collection reports | planned |
| P3 | Attendance + the daily at-risk action list (days-since-visit is the only churn signal with peer-reviewed multi-country support) | planned |
| P4 | Renewals pipeline + click-to-WhatsApp composer (₹0 — no BSP spend until D3/D4 are answered) | planned |
| P5 | Staff, roles & permissions + PT session ledger | planned |
| P6 | Reports + GST invoices | planned |
| P7 | Supabase adapter, RLS migrations, deploy; fold `member_summary` back in as app activity | planned |

## Testing

`apps/dashboard/test/crm/**`, run with `npm test --workspace apps/dashboard` (vitest, Node, no
browser). Mirrors the mobile app's O1 lane. The gate is `.github/workflows/ci.yml`, which typechecks,
tests and **builds** both workspaces on every push — the mobile release workflow only runs on a `v*`
tag, and the CRM ships without one, so it would otherwise have had no gate at all.

## Running it

```bash
npm run dev --workspace apps/dashboard
```

Then either "Create my gym" (starts genuinely empty) or "Explore a demo gym" (~128 members with
payment history and attendance). The demo is **always an explicit choice, never the default** — the
mobile app's Phase O2 lesson: a real gym owner must never find fake members in their own roster.
