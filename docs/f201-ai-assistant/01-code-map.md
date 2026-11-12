# 01 — Code map for F201 (from origin/main 926d8d99, 12 Nov 2026)

Four facts that shape the design:
1. The only server-side group send is IN-APP gym messages: `owner_send_message(p_key, p_kind, p_title, p_body, p_to uuid[], p_send_at)` (0025, latest 0042). WhatsApp to members is `wa.me` one at a time from the owner's phone (send queue). The MettleUp business number is blocked (131042).
2. No credit/wallet code exists.
3. Plan id `'ai'` = Pro features; `PACKS_FOR_SALE = ['starter','pro']`; `PLAN_GATE_ON = false`, `BILLING_ONLINE_ON = false` (packages/theme/src/plans.ts).
4. Template to copy: `deploy/panel/help.js` (`/api/help`): `claude-haiku-5-5` via @anthropic-ai/sdk, secret `CLAUDE_HELP_KEY`, $80/month cap from D1 `help_usage`, JSON-schema output, cached system prompt, 15 s timeout.

## Dashboard (apps/dashboard)
- Vite 6 + React 19 + TS; entry src/main.tsx -> src/crm/CrmApp.tsx. src/App.tsx + src/components/* are legacy, unused.
- Hash router src/crm/ui/router.tsx (`navigate`, `useRoute`, `Link`).
- New screen checklist: screens/X.tsx; `case` in `Screen()` in CrmApp.tsx (~319); nav entry in `navFor(role,[...])` (~204); phone More list screens/More.tsx:78; `offlinePage()` in CrmApp; `demoNeedsRealGym()` src/crm/demo/demoMode.tsx:112; `canOpen()` src/crm/auth/permissions.ts; help article or `NO_HELP_SCREENS` (CI scripts/ci/help_coverage.mjs); crawl list apps/dashboard/scripts/crawl.mjs:38.
- Data: whole gym in memory, `CrmSnapshot` src/crm/data/adapter.ts:67 (gym, members, plans, memberships, payments, visits, enquiries, expenses, workoutPlans). Read `useCrm()` (src/crm/store.tsx). Writes via `CrmData` methods (createMember, sellMembership, recordPayment, extendMembership, checkIn, createEnquiry...). Cloud: src/crm/data/cloud.ts, `crm_records` JSON rows, `crm_pull`/`crm_push` (0010), version-checked.
- RPC helper `call(fn,{p_key,...})` src/crm/shop/api.ts:39 (15 s). Proxy `/sb` (src/lib/supabase.ts, deploy/panel/proxy.js).
- Roles `'owner'|'staff'` (src/crm/auth/signin.ts:15); `can()`, `canOpen()` in permissions.ts. Messaging is owner-only. Server: `_owner_gym`, `_owner_only_gym`.
- i18n: English + Hinglish (Latin) via `t()` (src/crm/lang/). Member-message templates: English / Hindi (Devanagari) / both (logic/messageTemplates.ts, messageWords.ts, ui/MessageLanguage.tsx).
- UI kit: src/crm/ui/kit.tsx (Card, PageHeader, SectionTitle, StatTile, Pill, Avatar, EmptyState, Button, TextField, SelectField, SearchField, ChipToggle, Sheet, CheckField, ErrorBanner, Toast, UndoBar, Row, Grid, ScrollX, NewDot, useIsCompact). Theme @forgeai/theme + src/theme.ts. (Frozen components/ui rule is the MOBILE app.)
- Help: deploy/panel/helpArticles.js `{id, who, title, text, screens[], unreleased?}`; tests helpArticles.test.mjs.
- What's new: `ADMIN_NEWS` src/crm/logic/whatsNew.ts:39; `ADMIN_NEWS_PENDING` (~447); `feature:true` -> new dots.

## Server
- Supabase migrations supabase/migrations, latest 0070. RPC style: security definer, search_path public, first arg p_key; errors as words. RLS on, no policies, revoke from anon/authenticated, grant only RPCs. Header says APPLIED LIVE / NOT APPLIED. Tests supabase/tests.
- Workers: deploy/panel (forgeai-panel, D1 forgeai-web, migrations deploy/panel/migrations 0001-0014, service binding HQ_PUSH); deploy/hq (forgeai-hq: service key, FCM push, billing).
- AI import fallback deploy/panel/aiMatch.js: Gemini first (GEMINI_API_KEY) then Claude (ANTHROPIC_API_KEY); owner-only via X-Forge-Key -> staff_me; limits in D1 ai_usage (0003) + ai_limits (0004); PII masked.
- Voice: deploy/panel/voice.js, Groq whisper-large-v3 (GROQ_API_KEY), counted ai_usage kind 'voice'; used only by the member app today.

## Messaging members
- In-app: tables gym_messages, gym_message_seen (0008). Kinds announcement/closed/timing/offer/event/reminder. Title <= 60, body <= 300. Limits 10/day; offer+event 1/day, 3/week; from 3rd message of the day no phone pop-up (0042). Client `sendMessage()` api.ts:131; screen ui/screens/Messages.tsx. Groups computed in browser logic/audience.ts (everyone, active, ending7, ended30, away, birthday, plan, batch) -> app member ids.
- Push: trigger -> push_jobs (0038) -> HQ push.js FCM channel gym-messages. One-to-one member_push_notes (0054).
- Auto reminders (0029): phones schedule locally.
- Member -> gym messages (0069): gym_talk_*; panel ui/screens/MemberMessages.tsx.

## Data / reports already there
- Types src/crm/types.ts. Dues: logic/collections.ts duesLedger/duesByMember (:334,:395); /numbers/owed. Today tiles logic/ownerNumbers.ts NumberId renewals|owed|stopped|new|busy. Members tile filters homeTiles.ts (active, exp-today, exp-1-3, exp-4-7, exp-8-15, expired, birthday, visited-today). Attendance logic/attendance.ts atRiskList, attendanceSummary. Growth logic/businessGrowth.ts. Expenses, GST, weekSummary, gymExport, gymReports.
- Workout/diet plans logic/workoutPlans.ts, logic/dietPlans.ts; enquiries logic/enquiries.ts; trainers 0050/0065.

## Plans and billing
- packages/theme/src/plans.ts: GymPack starter|pro|ai; PACK_PRICES.ai 2,499/24,990.
- gyms.plan (0030, HQ writes). Panel gating src/crm/plan/pack.ts, GymPackProvider.tsx (owner_gym_pack 0046, not live). Server gating 0062 (not live).
- Owner billing: manual Pay MettleUp 0060 (not live), online via deploy/hq/billing.js (test keys only, BILLING="test", switch app_config 'billing_checkout' 0063 not live).

## Every "Pro + AI" mention (to replace)
Site/code: apps/dashboard/public/home/index.html:937-954; packages/theme/src/plans.ts:12,51,97-101; apps/dashboard/src/crm/logic/payMettleUp.ts:28,41; ui/BillingOnline.tsx:150; logic/billing.ts:169; logic/gymState.ts:20,35; logic/trial.ts:15,51; apps/hq/public/logic.js:285,287; deploy/hq/api.js:71; deploy/hq/billing.js:280.
Supabase: 0030:19,68,159; 0046:7,16; 0060:20,238,261; 0062:73; 0063:30,37,182,254,403 (keep 'ai' id valid in old migrations; do not edit applied files).
Tests: apps/dashboard/test/crm/pricesOneSource.test.ts; payMettleUp.test.ts:48; apps/hq/test/logic.test.mjs:171-182,254,303; deploy/hq/billing.test.mjs:265,275; deploy/hq/hq.test.mjs:462,465; apps/mobile/test/theme/plans.test.ts:34; supabase/tests/0063_gym_checkout.sql:59.
Docs: OWNER-INBOX rows; docs/drafts/about.html:24; docs/drafts/POLICY-PAGES.md:22; docs/launch/WEBSITE-COPY-2026-10-24.md; docs/overhaul/BILLING-DESIGN.md:34; research R-pricing-jaipur.md.

## Member app
Gym tab bell -> /shop/inbox (src/shop/InboxScreen.tsx) from member_messages. Push via expo-notifications + FCM; fallback check every ~15 min.

## CI
ci.yml job check: dashboard typecheck, vitest, node --test deploy/panel/*.test.mjs, HQ tests, build, crawl (390/1280 + axe), playwright (e2e/, faked server e2e/support.mjs). Job database: supabase start + db lint + supabase/tests.
