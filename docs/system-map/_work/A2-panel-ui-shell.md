# A2-panel-ui-shell checkpoint

Output: docs/system-map/_work/out/A2-panel-ui-shell.jsonl (40 rows, F-panel-500 to F-panel-539).

## Steps
- [x] 1. Read the 153 source lines.
- [x] 2. Opened the code. Read: every file's opening comment, router.tsx whole, More.tsx 40-239, PlusLock.tsx 1-70,
      LapseBanner.tsx 20-68, auth/permissions.ts 24-131, plan/pack.ts (Pro list), and 4 to 10 lines around each
      sheet, saved-on-device key, tab and WhatsApp/email link. About 1,650 code lines of the 2,500 allowed.
- [x] 3. Switches and plan gates noted (below).
- [x] 4. Grouped into features.
- [x] 5. Rows written.
- [x] 6. Helpers written as one not-a-feature row (F-panel-539).
- [x] Coverage check run: every one of the 153 source ids is in a row; every entry path and line exists.

## Finished units
- unit 1: shell, device, offline, first run, set-up, alerts, what's new (F-panel-500 to 506)
- unit 2: Today, members, money, plans, visits, enquiries, import (F-panel-507 to 519)
- unit 3: messages, training, plans for members, challenges (F-panel-520 to 527)
- unit 4: settings, web page, machines, billing, assistant, help, helpers (F-panel-528 to 539)

## Switches and plan gates met
- PLAN_GATE_ON = false (packages/theme/src/plans.ts:40). Pro pages when on (plan/pack.ts:15-19): shop, challenges,
  workouts, diet, numbers, growth, settings/branding; parts: workout offer (Messages.tsx:62), Your numbers on Today
  (Today.tsx:429), trainer plans and measurements on a member's page (MemberDetail.tsx:638). Also drives the
  stopped-paying line (LapseBanner.tsx:24).
- BILLING_ONLINE_ON = false (packages/theme/src/plans.ts:231): Pay online and MettleUp receipts (BillingOnline.tsx:65).
- MEMBER_PLAN_GATE_ON = false (packages/theme/src/memberPlan.ts:28): MettleUp Plus lock card (PlusLock.tsx:31).
- Role gates (auth/permissions.ts:104-129): staff cannot open expenses, messages (except offer and reminders),
  settings/branding, settings/mettleup, branches, numbers/owed, growth, assistant, setup.
- Per-gym or server-ready switches: Busy machines on/off (BusyMachines.tsx header), Bring a friend free days and 0056,
  web page (HQ switch 0090, part 0080), AI Assistant (0071 + worker), member messages (0069), questions (0053),
  training progress (0050 + Trainer tick), workout of the day (0051), member photos (0043), Worker JOIN_PAY.

## Could not check
- The area is 31,680 lines, not the 12,000 the brief allows for one area; only about 1,650 lines were read, so most
  rows rest on each file's opening comment, not on the full code. Roles inside a screen (which buttons the desk
  sees) were checked only through permissions.ts and a search for role checks.
- Entry machines: no switch or plan gate was read; row says unknown.
- Trainers page: who may edit a trainer and whether it hides on an older server was not read; switch unknown.
- AI Assistant tier (credits wallet) not read: unknown.
- Whether each "hidden until the server has 00xx" migration is on the live server: needs the database, not in this step.
- WhatsNew.tsx, AlertsCards.tsx, GetStartedCard.tsx and other files with only a key or screen line were not read beyond
  their header.

## Seen in passing
- More.tsx:1-5 opening comment lists far fewer rows than the page now shows (stale comment, not a bug).
- InstallCard.tsx:113 and OwnerNumbers.tsx:94 still save under the old "forgeai." name while AlertsCards.tsx:406 uses
  "mettleup."; harmless unless a rename ever drops the old keys.
- No clear bug seen in the lines read.
