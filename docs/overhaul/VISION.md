# ForgeAI — Vision, Business Model & Competitive Position (v1, for approval)

**Date:** 2026-07-22 · **Status:** DRAFT FOR OWNER APPROVAL · **Supersedes:** `docs/PRD.md` (historical)
**Evidence base:** `docs/overhaul/research/` — R1 deep research, 37 agents, 9 areas, 51 adversarial
fact-checks, 1 completeness critic. **12 CONFIRMED · 35 CORRECTED · 4 REFUTED.**
**Reused, not redone:** `docs/DECISIONS.md` (2026-07-07 infrastructure/cost research — still valid).

> **Read §1 and §3 if you read nothing else.** The research did not politely confirm the plan.
> It killed two revenue assumptions, inverted one core feature, and named a competitor who bought
> our intended moat five weeks ago. It also found a real, defensible business — a smaller and
> differently-shaped one than the brief assumed.

---

## 1. What the research changed (the honest headline)

The brief assumed: build a gym-management CRM for gym owners, bundle the member app as a perk, sell
premium AI to members, and take a cut of payments. Four of those five load-bearing assumptions moved.

| Assumption in the brief | What the evidence says | Verdict |
|---|---|---|
| Member AI upgrades are a second revenue stream | RevenueCat 2026: **median download→paid in Health & Fitness is 2.9%**. Worse, *every* AI charged as an upgrade on top of an existing paid product drew user revolt (Garmin Connect+ boycott, Strava "pointless gimmickry"); *every* well-received AI layer was **bundled free** (Whoop Coach, EGYM Genius). | **Demoted.** Member-paid AI is a rounding error and a reputational risk. AI becomes an **owner-paid** line. |
| Payments/collections are the long-term revenue engine (the ABC/Mindbody model) | Mechanically possible — a fact-checker **refuted** the "India take-rate is capped at 0.1%" claim (that number was a *hypothetical* in Razorpay's partner docs; partners set their own markup). But Indian gyms already collect fees by **direct UPI QR at zero cost**. We would be charging for something they get free. | **Dropped as a revenue line.** Kept only as a *feature* (mandates/reconciliation) where it saves the owner work. |
| Recurring billing + dunning is the flagship CRM feature | Indian gyms sell **annual lump sums at 20–30% discount**, not monthly subscriptions. The CRM's real job is **expiry-date renewal chasing, part-payment/dues tracking, and cash-vs-UPI reconciliation**. A dunning engine would have almost no transactions to retry. | **Inverted.** Build the renewal/dues ledger, not the billing engine. |
| Nobody ships a gym CRM with a member app members love — our unique wedge | **REFUTED as stated.** Wodify Client pairs booking with logging, PRs and leaderboards at **4.9/5 across 16K ratings**; PushPress ships Train; Virtuagym and Exercise.com unify natively. The surviving, narrower truth: this is solved in the **CrossFit/boutique** segment and unsolved in **value gyms and big-box**, and nobody's logging matches Hevy's depth. | **Narrowed, not dead.** Our wedge is real only against value-gym and India-local tooling. |
| WhatsApp renewal reminders are the killer included feature | Generic "prompts/cues" — what every gym CRM ships — produce **trivial effects** in systematic review; nudge effects **decay** (only 8% of 53 megastudy arms persisted); and a randomised field experiment found naive proactive at-risk outreach **increased** churn (10% vs 6%). | **Kept but reframed.** Reminders are table stakes to *sell*; they are not the retention product. Habit-formation mechanics are. |

**And the fact nobody had five weeks ago:** on **23 June 2026, Daxko (US, PE-backed) acquired
FitnessForce** — India's category leader, 1,000+ Indian gyms, 18 years old — *explicitly* for its
UPI/GST/WhatsApp/biometric "local rails," to sell into India, the Middle East and SEA. The single
biggest differentiator this plan was built on ("India-localized rails nobody has") was just bought by
a capitalised acquirer. That does not close the window, but it dates it.

---

## 2. Contradictions the critic found — settled here

The research corpus contradicted itself in four places. Leaving these unsettled would produce an
incoherent product. Decisions:

1. **Payments as revenue → NO.** Settled against it (§1). Indian gyms have a free substitute. We
   will not build a business on charging for what UPI gives away.
2. **Recurring billing vs annual prepay → ANNUAL PREPAY WINS.** The renewal cliff, not the monthly
   debit, is the money moment. Product follows this.
3. **PT commission ledger sizing → SMALLER THAN CLAIMED.** A fact-check corrected PT from
   "14–20% of revenue" down to **~10% median of a club's revenue** (IHRSA); the bigger number is a
   market-segment figure, not one gym's P&L. On a ₹21–36 lakh/yr gym that is a ₹2–3.6 lakh
   commissionable pool. Still a real unserved pain, but **not** a headline feature. Demoted to Phase 2.
4. **Keyboard-first desktop CRM vs owner's-phone-first → UNRESOLVED BY DESK RESEARCH.** These are
   two different products. **This is question #1 for the design-partner gym** (§8). Building the
   wrong one wastes months.

---

## 3. The strategic challenge — and my recommendation

**I have to challenge the brief here, as a co-founder would.**

The pivot as literally specified — *build a full gym-management CRM for Indian value gyms* — points
our scarcest resource (one founder's build time) at the **most commoditised, lowest-priced,
hardest-to-support** layer of the stack, and treats our one genuinely rare asset as a free giveaway.

The evidence for why that is the wrong shape:

- **The CRM layer is commodity.** 20+ Indian vendors already sell it at ₹500–3,000/month, most with
  single-digit review counts. Feature parity on scheduling/classes/billing is table stakes.
- **The economics are brutal.** India's category *leader* — FitnessForce, 18 years, 1,000+ gyms —
  ran on 10 employees at **under ₹10 Cr revenue** before selling. Indian fitness-tech funding fell
  **73% YoY to $16.9M in 2025**. There is no funding tailwind; this must be bootstrap-profitable.
- **Support is the existential risk, and it is not a build problem.** The #1 documented reason gym
  owners *leave* incumbents is **post-sale support collapse**. Gyms operate 5am–10pm, seven days, in
  Hindi and regional languages. A solo founder is structurally the thing customers are running from.
- **GST now works against us.** Gym services moved to **5% GST without input tax credit (22 Sep
  2025)** — meaning our SaaS fee is no longer creditable for the gym. Software got ~18% more
  expensive in real terms for every Indian gym, overnight.

**What we actually own that others don't:** a shipped, feature-complete, offline-first, Hevy-class
training app with an AI coach grounded in the member's own logged history. That took months to build
and is genuinely hard to copy quickly. The research is unambiguous that the *member-facing training
surface* is where incumbent value-gym tooling is thinnest and where India-local vendors ship nothing
but a portal.

### The recommendation: be the gym's member-facing product, not its back office

**Wedge:** "Your members get a premium branded training app and an AI coach. You get to see who's
about to quit — early enough to do something."

**Build (the 20% of a CRM that carries 80% of the differentiated value):**
- The member app, gym-linked (**already built** — the tracker, AI coach, offline logging)
- **Attendance + engagement signal** — check-in plus *depth of engagement* (sets logged, session
  length) that no competitor has, because no competitor's members actually use their app
- **Renewal & dues ledger** — expiry pipeline, part-payments, cash-vs-UPI reconciliation
- **A daily "talk to these members" action list** — driven by days-since-last-visit, the *only*
  churn signal with peer-reviewed multi-country support (35–54% of model power, AUC 0.86)
- **WhatsApp** for renewals and comeback nudges (table stakes to sell, not the moat)

**Deliberately do NOT build (yet, or ever):** class scheduling depth, POS, inventory, supplements,
merchandise, access-control hardware, payroll, multi-branch roll-ups, marketing campaign builders,
lead-scoring funnels, digital waivers. Every one is either commodity, hardware-coupled, or an
enterprise need our target gym doesn't have. **The brief listed ~40 owner features. We are choosing
about 8.** Saying no to the other 32 *is* the strategy.

**Why this ordering wins:** it reuses the asset that exists, it attacks the layer where evidence says
incumbents are weakest, it is defensible against a fast-following Daxko (they can copy rails in
months; they cannot copy a beloved member training app quickly), and it keeps the support surface
small enough for one person.

---

## 4. Business model

**Single revenue line: owner-paid SaaS, flat, all-inclusive, published in INR.**

Published pricing is itself the weapon — quote-only pricing and mid-contract increases are the #1
recurring owner grievance across every incumbent review corpus.

| Tier | Members | Price/month | Includes |
|---|---|---|---|
| **Pilot** | any | **Free** (time-boxed, converts on a date, not "forever") | Everything below |
| **Core** | ≤200 | ₹1,499 | Member app · attendance · renewals/dues · WhatsApp · at-risk list |
| **Growth** | 201–600 | ₹2,999 | + PT/session ledger · staff roles · multi-trainer |
| **AI** | add-on | ₹999–1,999 | Auto-programming for all members, trainer-approved |

**Why owner-paid AI, not member-paid:** the evidence is one-directional — bundled AI earns goodwill,
upsold AI earns revolt — and 2.9% member conversion cannot fund anything. Selling AI to the owner as
"trainer capacity you don't have to hire" is the pattern that actually works (EGYM Genius via EoS
Fitness; Volt at flat facility pricing). A member-paid personal tier stays *possible* later; it is
never the plan.

**Honest revenue ceiling — the number the critic demanded, so you can decide with it in front of you:**

- India has ~46,500 facilities; ~37,200 are value gyms. Realistic *paid-software* penetration looks
  like **10–20%**, not 100% (20+ vendors survive on single-digit review counts; the leader had 1,000
  clients after 18 years).
- **500 gyms × ₹2,000/mo ≈ ₹1.2 Cr/year.** **1,500 gyms × ₹2,500/mo ≈ ₹4.5 Cr/year.**
- 500 gyms would already make us roughly the size of the 18-year category leader.

**So: this is a ₹1–4 Cr/year business at multi-year heroic execution, India-only.** That is a strong
solo-founder outcome (~$150k–550k revenue). It is not a venture-scale outcome, and no amount of
product excellence changes that arithmetic. **You should choose this deliberately, not discover it in
year three.**

**The escape hatch, flagged not chosen:** every winner in this category monetises *outside* India —
Zenoti ($225–600/mo, 30,000+ businesses), FitBudd (Indian company, sells to US/UK/CA/AU),
FitnessForce (sold to a US acquirer). Western indie gyms pay **10x** the Indian price for the same
software. Our member app is *more* differentiated in a market that pays in dollars. **Recommendation:
build India-first with the design-partner gym, but keep the product export-clean** (currency,
language, tax, payment rails all pluggable from day one) so Path B stays open at low cost. Do not
architect India-specific assumptions into the core.

---

## 5. Competitive position

| Competitor class | Their strength | Their weakness | Our position |
|---|---|---|---|
| **Daxko/FitnessForce** (the real threat) | Local rails, 1,000+ gyms, PE capital, 18-yr brand | Legacy product; US owner now steering; acquisition-integration drag is the documented pattern | Move on the member-app layer *before* they do; they buy rails, not beloved apps |
| **Global incumbents** (Mindbody, Glofox, Zen Planner) | Brand, breadth, payments engine | USD pricing (~₹8,300+/mo entry), no UPI/GST/WhatsApp, quote-only pricing, support collapse, 12–24-mo auto-renew lock-in | Not a real competitor for an Indian value gym today |
| **Western challengers** (PushPress, Wodify, Gymdesk) | Genuinely good products; PushPress/Wodify member apps are *loved* (4.8–4.9) | Not in India, no INR/UPI/GST, $57–229/mo | Competitors only if we take Path B; they set the quality bar |
| **India-local** (~20 vendors, ₹500–3,000/mo) | Price, local rails, feet-on-street | Thin member portals, dated UI, no AI, no engagement data | **This is who we beat, and the member app is how** |
| **cult.fit** (Cult Neo, ₹9,000–15,000/yr franchise, July 2026 IPO) | Capital, brand, consumer trust | Franchise model attacks *our customers* | We arm independents against them: "your gym, your app, your AI coach" |

---

## 6. Risks that could kill this

1. **Solo-founder support load** — existential, and *the* documented reason customers leave this
   category. Mitigation must be product-level (self-serve onboarding, low-touch design), not
   heroics. If pilots demand phone support at 6am, the model breaks.
2. **Daxko/FitnessForce moves first** on the member app with capital and 1,000 installed gyms.
3. **The wedge may already be served** in segments we haven't observed (the REFUTED finding proves
   assumptions here were wrong once already).
4. **Regulatory walls nobody has checked** (critic gap): RBI Payment Aggregator rules if we ever
   touch money flow, DPDP obligations on biometric attendance data, TRAI DLT for SMS, and **2025's
   change to WhatsApp per-message pricing** — which may invalidate the "₹300–400/month of messages
   inside a ₹1,499 plan" unit economics.
5. **Cost-to-serve is uncomputed.** AI inference for 200 members/gym + WhatsApp + infra + support at
   ₹1,499/month may be thin or negative. **Must be modelled before pricing is published.**
6. **Biometric integration may be technically impossible from a browser** (ESSL/ZKTeco SDKs are
   Windows/on-prem). If it's genuinely table stakes, that's a deal-blocker we haven't scoped.
7. **Retention claims may not survive measurement.** The evidence says naive outreach can *increase*
   churn. If we sell "we reduce churn" we must be able to prove it — or not say it.

---

## 7. What we are NOT doing (explicit, so it stays decided)

Not building a Mindbody clone · not a payments company · not white-label per-gym apps (Apple 4.2.6
sanctions the single "picker" binary; per-gym apps force each gym to hold its own Apple account,
DUNS and domain — unworkable for Indian SMBs) · not member-paid AI as the revenue plan · not
class-booking-first (only ~50% of Indian centres run group classes at all) · not chasing the ~32
owner features we cut in §3 · not raising money.

---

## 8. What must be true — and how we find out (the immediate next step)

**The critic's sharpest finding: there is zero primary research in this program.** Nine areas of desk
research over Western review sites, while a real Indian gym — our design partner — sits unobserved.
Central bets (cash/UPI reconciliation is the #1 daily mess; owners will pay ₹1,499; phone-first vs
desktop) rest on inference from US sources.

**Recommendation: before any platform code, spend one week at the design-partner gym.** It is the
cheapest, highest-fidelity data available and it settles the four questions that decide the product:

1. **Phone or desktop?** What does the front desk physically run on? (Settles §2.4 — a wrong answer
   here wastes months.)
2. **What is the actual daily mess?** Shadow the front desk. Is it dues reconciliation, renewal
   chasing, attendance, trainer scheduling — or something nobody guessed?
3. **What does the money look like?** Annual vs monthly mix, cash vs UPI, part-payments, dues
   outstanding, PT split, renewal rate. Get the real register.
4. **What would they pay, and what would they cancel today to pay it?**

Deliverable: `docs/overhaul/FIELDWORK.md` (a ready-to-use question kit + what to photograph/export),
written alongside this document so the visit can happen immediately.

**Then, and only then:** MVP definition, architecture, database, API, UI/design system, migration
plan, sprint plan — the remaining deliverables from the brief. Writing them now would be fiction
dressed as a plan.

---

## Executive Summary (Simple English)

- I had ~35 researchers study the world's gym software, Indian gyms, members, trainers, AI, pricing and retention — then had every important claim attacked by a separate fact-checker.
- **Half the "facts" were wrong.** 35 claims needed correcting and 4 were completely false. Building on the first draft would have been building on sand.
- **Selling AI to members is a dead end.** Only about 3 in 100 people ever pay for a fitness app upgrade — and every company that charged extra for AI made its users angry. AI should be included, and sold to the *gym*, not the member.
- **Taking a cut of payments won't work here.** Indian gyms already collect money by UPI for free. We'd be charging for something they get for nothing.
- **Indian gyms don't do monthly billing.** They take one yearly payment upfront. So the software's real job is chasing renewals and tracking who still owes money — not running monthly debits.
- **A US company bought our best idea five weeks ago.** Daxko bought FitnessForce (India's biggest gym software) in June, specifically for its Indian payment/tax/WhatsApp features. We can still win, but not by being "the one with Indian features."
- **My honest challenge to the plan:** building a full gym management system means competing in the cheapest, most crowded, hardest-to-support part of the market — while giving away the one thing we own that nobody else has.
- **What we own is the members' app.** A genuinely great workout app with an AI coach. Indian gym software ships nothing close.
- **So my recommendation: be the gym's member-facing product, not its back office.** Great member app + see who's about to quit + chase renewals. Build about 8 features properly instead of 40 badly.
- **Say no loudly.** No point-of-sale, no inventory, no door hardware, no payroll, no class-booking-first. Those are commodity or hardware problems.
- **Honest money picture: this is a ₹1–4 crore a year business if it goes very well over several years.** Good for one person. Not a big-investor business. You should choose that on purpose.
- **Keep the export door open.** Western gyms pay 10x Indian prices for the same software, and every winner in this category made its money outside India. Build so we *could* go there later without a rewrite.
- **The biggest risk is you, alone, doing support** — gyms run 5am to 10pm, and bad support is the #1 reason gym owners leave their software.
- **The most important thing missing is real-world observation.** All this research is from the internet. Your gym is sitting right there, unstudied.
- **What's next: spend one week inside your gym before writing any code.** I'll hand you a question kit. Its answers decide whether we build for a phone or a computer — a choice that's expensive to get wrong.
