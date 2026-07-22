# ForgeAI Overhaul — B2B2C Platform Pivot (kickoff brief)

**Date:** 2026-07-22 · **Status:** DIRECTION SET, RESEARCH PENDING · **No code in this phase.**
This document is the entrypoint for the overhaul track. It records the owner's new vision,
what the existing codebase already gives us, the carried-forward weakness log (owner asked to
keep it), what earlier research already settled, and the research plan that runs next.

---

## 1. The directive (owner, 2026-07-22)

ForgeAI stops being a consumer-first app and becomes a **B2B2C SaaS ecosystem**:

- **Pillar 1 — Gym Management CRM** (web-first): the operating system of the gym. Owners run
  the business from it. Architecture (responsive web / PWA / desktop / mobile) to be
  recommended from research, not assumed.
- **Pillar 2 — Consumer mobile app**: the existing app continues, tightly integrated with the
  gym CRM. Members get it as a benefit of their gym membership.
- **Pillar 3 — Premium AI layer**: standard tracking is free with membership; advanced AI is a
  paid upgrade. What people would actually pay for = a research question.

**Revenue:** (1) monthly SaaS paid by gym owners; (2) optional member AI upgrades (open for
refinement). Owner explicitly asked to challenge the model if a better one exists.

**Process:** research first (competitors, owner pain, member wants, trainer workflows, pricing,
AI, retention), then strategy documents, then approval, then implementation. Act like a
co-founder. Every major phase ends with a plain-English executive summary.

---

## 2. Co-founder read (pre-research position — research must confirm or kill each)

1. **The pivot retroactively makes sense of the codebase.** The app accidentally built the
   perfect free/paid seam: the tracker is offline-first with zero network calls (= the free
   member benefit, costs us nothing per user) and the AI layer is already isolated behind a
   key gate with a deterministic offline fallback (= the paid upgrade seam). The old PRD's
   "AI-conversation-first" framing is dead; Pillar 2/3 is what the code already is.
2. **Gym SaaS must carry the business; member AI is upside, not the plan.** Consumer premium
   attach rates in fitness apps are typically low single digits (VERIFY in research). Also
   research the alternative: the **gym owner** buys the AI tier for all members as a retention
   feature (owner-paid "AI included" plan tier) instead of — or alongside — member-direct
   billing. In India, per-member microtransactions face UPI-autopay friction; owner-paid may
   convert far better. OPEN.
3. **Likely missing revenue (research to size):** (a) **payments rail** — gym membership fee
   collection through the platform (UPI autopay + failed-payment recovery + renewal chasing)
   with a small take-rate; this is how several US gym-SaaS firms actually make their money and
   is a natural "Stripe of Indian gyms" wedge; (b) **white-label app as a premium tier**;
   (c) later marketplace (PT session packs, supplements/POS).
4. **Biggest unmade product decision: one ForgeAI-branded member app vs white-label per gym.**
   Affects app-store operations, cost, branding, sales pitch, and the entire distribution
   model. Research both models (who does which, at what tier, what it costs them to operate).
5. **Two-way sync becomes unavoidable.** The locked 2026-07-07 architecture is strictly
   one-way (phone → cloud summary). Trainer-assigns-plan, gym announcements, membership
   status, class bookings all require **cloud → phone** flows. This reverses a deliberate
   earlier decision and is the single biggest technical implication of the pivot — must be
   re-decided explicitly, scoped narrowly (assigned-content pull ≠ full conflict-resolution
   sync).
6. **Member identity changes.** "Members NOT on Supabase Auth" (the MAU-cost decision) assumed
   members never log in from scratch or transact. Invitation-based onboarding + member AI
   purchases + multi-device restore change that calculus. Re-examine.
7. **India-first is assumed** (directive lists GST + WhatsApp; every locked rail is Indian:
   Razorpay/UPI, MSG91/DLT, WhatsApp BSP, DPDP, Mumbai region). Global competitors are studied
   for patterns, not as the target market. Research must add **India-local competitors** and
   India-specific gym-owner workflows (cash collection, GST invoices, WhatsApp-first sales).
8. **Scope discipline is the existential risk.** The owner-pain list in the directive is ~40
   features; every incumbent took a decade to build theirs. The research's most important
   output is the **wedge**: the smallest CRM slice that wins an Indian gym deal.

---

## 3. Head-start map (vision need → what already exists)

| Vision need | Existing asset | State / gap |
|---|---|---|
| Multi-gym cloud with data isolation | Supabase (Mumbai) schema + RLS + RPCs, adversarially reviewed (2 HIGH holes found+fixed) | Foundation real; only owner/member roles — needs manager/trainer/receptionist/super-admin |
| Owner web CRM | `apps/dashboard` Vite SPA (~1.1k lines): login, create-gym, KPIs, members table, at-risk list, leaderboard | Read-only seed, never deployed. "At-risk" = churn-prediction v0 |
| Member onboarding via gym | Join-by-code flow (app + `create_gym`/`join_gym_by_code` RPCs) | Works; invitation-link flow to be designed |
| Member app (Pillar 2) | Feature-complete Hevy-class tracker + AI coach, offline-first, v0.18.0 | Strongest asset. Carried weaknesses in §4 |
| Free/paid AI seam (Pillar 3) | Key-gated cloud AI + offline localCoach fallback; server-side AI proxy designed (B2B2C Phase 3, unbuilt) | Seam exists; proxy + billing + entitlements to build |
| Phone→cloud sync | SQLite outbox → idempotent one-way summary push, NetInfo-gated | One-way only; two-way question in §2.5 |
| Backup/restore | Google Drive full-history snapshot + restore | Built, gated on owner OAuth steps |
| India rails & compliance | Verified decisions: Razorpay+UPI, WhatsApp Utility via BSP, MSG91 OTP, DPDP checklist, cost model at 10/100/1000 gyms | Decided on paper (2026-07-07), unbuilt; re-verify prices before spending |
| Monorepo for multi-app platform | npm workspaces: `apps/mobile` + `apps/dashboard` + `packages/theme` | In place; CI builds mobile from it green |

**Rough estimate: the plumbing under Pillars 2 and 3 is largely built; Pillar 1 is ~10% built
(a read-only dashboard) and is where almost all new work lives.**

---

## 4. Weakness log (carried forward — owner asked to keep this)

From the 2026-07-12 holistic assessment + the 2026-07-22 state-check. Each gets a disposition
under the new plan; none may be silently dropped.

| # | Weakness | Why it matters under the NEW vision | Disposition |
|---|---|---|---|
| W1 | Fake "Arjun" seed data on first launch; no real-user day-one; "Reset" regenerates fake data | A member invited by their real gym must NEVER see fake data. Today's onboarding is disqualifying for B2B2C | **Dissolved by the pivot**: invitation-based onboarding replaces the seed; seed survives only as an explicit "demo mode" for sales. Design in UX phase |
| W2 | Frozen-file rule (engine, UI kit, charts, schema.ts, repo/service signatures) forces workarounds; duplicate parallel read paths exist | Platform build cannot carry this drag; e.g. the slow third of the start-workout tap lives in frozen `services/coach.ts` | **Formally unfreeze with a safety net**: tests first (W3), then lift freeze module-by-module in the migration plan. Owner approval per module |
| W3 | Zero automated tests over ~24.6k lines; ship gate is manual review only | Multi-tenant + payments + member billing raises stakes an order of magnitude. Untested is untenable | **Fix BEFORE platform build**: vitest lane over pure logic (import classifiers, plate/warmup math, streak, PR logic, engine) + CI gate. Early roadmap item |
| W4 | Can't edit a logged workout (assessment #12); no "start fresh" reset | Table-stakes for a member app that gyms pay to hand out; bad first impression for real users | Pillar-2 backlog, high priority; "start fresh" is subsumed by W1's real onboarding |
| W5 | Accessibility untouched: zero font-scaling support (grep = 0 matches), screen-reader gaps, sub-44dp touch targets, contrast misses | A paid B2B product gets held to a higher bar; gym demographics include older members | Pillar-2 quality pass, scheduled not optional |
| W6 | Perf leftovers: dataExport N+1 (~975 round-trips), frozen `getTodaysWorkout` third-of-tap | Minor today; dataExport matters more when gyms export member data | Fold into W2's unfreeze; dataExport is a 1-line repoint onto the verified batched read |
| W7 | Docs drift: PRD says AI-conversation-first; app is tracker-first with coach demoted | Confusing for every future session/contributor | **Resolved by this pivot** — new vision docs supersede PRD.md; PRD marked historical |
| W8 | Sync is one-way summary-only; cloud cannot reach the phone | Blocks trainer-assigns-plan, membership status, announcements, bookings — core CRM value | **Re-architect deliberately** (§2.5). Narrow, additive cloud→phone channels; not naive full sync |
| W9 | Members-on-signed-JWT (not Supabase Auth) assumed members never transact | Member AI purchases + invitations + multi-device need a stronger member identity | Re-decide in architecture phase with the MAU cost model on the table |
| W10 | Drive backup + dashboard deploy + release keystore all gated on owner setup steps (docs/OWNER-TODO.md) | Backup becomes a retention promise ("your history is safe") once gyms pay | Roll owner-gates into the platform onboarding checklist |

---

## 5. Already researched — do NOT redo (2026-07-07 record: docs/DECISIONS.md)

A 23-agent fact-checked research pass already settled, with live-price citations:
infrastructure platform + region, multi-tenant table/RLS/index design, the MAU cost bomb,
AI model routing + per-member-day cost (~$0.008–0.010), dashboard hosting, Razorpay vs
alternatives, WhatsApp template economics, MSG91/DLT, DPDP compliance checklist, and the cost
trajectory at 10/100/1000 gyms (~$150 / ~$1.3k / ~$7.7–12k per month).

**Reuse it. The new research must NOT re-litigate infrastructure.** It must cover what that
pass deliberately excluded: **competitors, product, pricing, users, and go-to-market.**
(Prices there are 2026-07-07 vintage — re-verify only when we're about to spend.)

---

## 6. Research plan — Phase R1 (next step, pending owner's go)

Method: parallel research agents per area → adversarial fact-check of load-bearing claims
(the July pattern that caught 1 refuted claim and several price corrections) → synthesis.
Sources: vendor sites/pricing, app-store reviews, Reddit/forums, gym-owner communities,
YouTube reviews, India-specific channels.

| Area | Core questions |
|---|---|
| A. Gym-SaaS competitive field | The ~19 named products + India-local players: features, pricing, model, strengths, top complaints, who wins which segment and why |
| B. Indian gym owner reality | How Indian gyms actually run today (Excel/WhatsApp/cash?), what they'd pay for first, GST/billing pain, staff structure, churn drivers |
| C. Member-app market | What members love/hate in Hevy/Strong/Fitbod/gym-branded apps; what drives retention; gamification that works vs gimmicks |
| D. Trainer workflows | Trainerize/TrueCoach/My PT Hub patterns; what trainers need daily; how PT revenue flows through gyms |
| E. AI that people pay for | Which AI fitness features have proven willingness-to-pay (Fitbod's algorithm, Whoop coach, ChatGPT fitness use); attach rates; owner-paid vs member-paid |
| F. Pricing & packaging | SaaS tiers that work at Indian price points; per-member vs flat; payments take-rate models; white-label economics |
| G. Retention & engagement mechanics | Churn-prediction signals gyms act on; campaigns that measurably reduce churn; loyalty/referral mechanics |
| H. Platform UX benchmarks | What makes Linear/Notion/Stripe feel the way they do — concretely, as buildable patterns for a CRM |

**Outputs (consolidating the directive's 18 deliverables into 6 docs, each ending with a
plain-English executive summary):**

1. `VISION.md` — vision, business model, competitive analysis, revenue design
2. `MVP-ROADMAP.md` — feature prioritization, MVP definition, phased roadmap, sprint-level plan
3. `ARCHITECTURE.md` — technical + database + API architecture, tech stack, multi-tenant/roles
4. `UX-DESIGN.md` — product experience, UI architecture, design system, onboarding flows
5. `MIGRATION.md` — how today's app + cloud + dashboard evolve without breaking (incl. W2 unfreeze sequence)
6. `RISKS.md` — risk analysis incl. the weakness-log dispositions above

---

## 7. Open owner gates (asked 2026-07-22)

1. Research depth/spend (full multi-agent deep-dive vs lighter pass).
2. Pilot gym access — is there a real gym to design for and sell to first?
3. The 6-month goal (first paying gym vs pilot fleet vs polished raise-ready product).

Answers recorded in PROGRESS.md when given.
