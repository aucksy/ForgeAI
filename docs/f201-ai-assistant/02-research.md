# F201 research: AI assistant for gym owners (MettleUp)
Researched 12 Nov 2026. Vendor claims are marked as vendor claims. Guesses are marked GUESS.

## A) What AI assistants in gym and small-business software do today

### Gym software
| Product | What its AI does | Source (date) |
|---|---|---|
| PushPress (Core AI Assistant) | Chat over gym data with 4 levels: quick lookups ("When was Sarah's last check-in?"), insights (churn, members gone 30 days, low-attendance classes), decisions ("who should I pay attention to?"), strategy. It also **takes actions**: charge no-shows, pause/cancel memberships, book a class, one-off charges, invoice a member. It **asks for confirmation** before acting. It **does not send** emails, texts or push. Early access: 5,000+ prompts from 354 gyms. Pro/Max plans only. | https://www.pushpress.com/blog/ai-assistant-for-gym-owners (19 May 2026); https://help.pushpress.com/en/articles/14473568-how-to-use-the-ai-assistant-in-pushpress-core (4 Jun 2026) |
| Mindbody Messenger[ai] | A 24/7 AI front desk: answers missed calls and texts, books clients, follows up on leads. Case study claims 80% of conversations handled by AI (vendor claim). AI Insights (Sep 2026, through parent Playlist): at-risk clients, forecasts, targeted lists that feed email/SMS marketing (Attentive partnership, Dec 2025). | https://www.mindbodyonline.com/business/education/case-study/how-shred415-decreased-response-times-mindbodys-ai ; https://www.mindbodyonline.com/business/education/blog/AI-insights ; https://athletechnews.com/mindbody-attentive-ai-marketing-tools-sms-email/ |
| Glofox / ABC Fitness | "ABC AI Agents" answer calls and chats. Third-party listings say it also flags at-risk members and automates messaging. No detail found. | https://www.glofox.com/blog/tag/gym-tips/ (2026) |
| Wodify | "Ask Wodify AI" ("how do I hit my retention goal this month?"); an MCP connector so ChatGPT/Claude can read gym reports; Wodify Retain flags at-risk members with ML. | https://www.wodify.com/products/ai-solutions-for-gyms-and-fitness ; https://www.wodify.com/blog/wodify-mcp-connector-api-access |
| Zen Planner Engage / AI Agent | AI handles leads, messages and calls. Sold as a flat monthly add-on with unlimited use. | https://landing.zenplanner.com/engage-ai |
| ABC Trainerize | AI Workout Builder drafts workouts that a coach edits before assigning. Messaging has no AI. One Aug 2026 review says full programs were "coming soon". | https://dupple.com/reviews/trainerize |
| Gymdesk, TeamUp | No owner AI assistant found. Gymdesk (a competitor, Jun 2026) interviewed 23 owners: none had switched software for AI. They cared about human support, a fast interface, and automation included rather than sold as an add-on. | https://gymdesk.com/blog/ai-for-gym-management (blocked when fetched; quoted from search snippet) |
| Zenoti Zeenie | Owners ask about revenue, provider performance, policies and reports. It **waits for user confirmation before taking actions** and respects staff permissions. English, Spanish and French only (no Hindi). | https://www.zenoti.com/platform/zeenie-ai-powered-assistant |
| Okfit (India) | AI workout and diet plans, an "AI Briefing" (₹2,000 plan and up), "SMS/WA/AI service" (₹1,000 plan). No chat assistant, voice or Hindi listed. Prices ₹500–3,000/month. | https://www.okfit.in/ (fetched 12 Nov 2026) |
| Easy Gym Software / MyGymDesk (India) | An AI WhatsApp bot, AI workout plans sent over WhatsApp, AI insights, automated WhatsApp reminders. From ₹799–829/month. Vendor claims. | https://easygymsoftware.com/india ; https://www.techjockey.com/detail/mygymdesk |
| FitnessForce, Wellyx, GymBook, Gymshim | No owner AI assistant found. Wellyx mentions "AI-powered scheduling". GymBook lists only WhatsApp/SMS. Gymshim: nothing found. | searches on 12 Nov 2026 |

**What this means:** no Indian competitor found offers an owner assistant that you can talk to in Hindi or Hinglish. The nearest copies of MettleUp's idea are PushPress (asks, then acts with confirmation, but cannot send) and Zenoti (confirms before acting, no Hindi).

### General small-business agents (ideas to borrow)
- **Shopify Sidekick:** data questions instead of reports, "where is this setting?", writing copy, discounts and coupons, shipping rates, editing policies, automations. You can save up to 25 frequent prompts as "Skills". Reviewers say it struggles with complex multi-step work. https://www.eesel.ai/blog/shopify-sidekick (2026), https://www.fudge.ai/guides/shopify-sidekick-use-cases/
- **Square AI:** owners and admins only. Questions about sales, customers and staff, plus how-to help. Nearly 200,000 questions in the beta. Added pinned charts and chat history. In April 2026 came Managerbot, which watches the business and automates routine tasks. https://squareup.com/us/en/press/square-ai-open-beta ; https://www.pymnts.com/artificial-intelligence-2/2026/new-square-ai-agent-automates-daily-tasks-for-main-street-sellers
- **HubSpot Breeze / Agent Hub:** moved to paying per result: about $1 per recommended lead and about 50 credits ($0.50) per resolved customer conversation from 14 Apr 2026 (third-party figures). Added AI spend caps. https://metronome.com/blog/pricing-model-spotlight-inside-hubspots-move-to-outcome-based-ai-credits ; https://www.cmswire.com/digital-experience/hubspot-rolls-out-ai-spend-caps-flexible-billing/

### What gets used most (evidence)
- Read-only questions far outnumber actions. PushPress's levels start at lookups. Square's 200,000 beta questions were data and how-to questions. Shopify's top use is data questions.
- Actions that touch money or members always get a confirmation step (PushPress, Zenoti).
- Sending to members is either left out on purpose (PushPress) or is the whole product (Mindbody Messenger[ai], Attentive).

### Complaints and failures found
- Gymdesk says many "AI" features are old automation with a new label. No owner switched software for AI. (competitor source)
- Automated replies to member complaints can backfire: members feel unheard and cancel. https://lowcodeagency.beehiiv.com/p/what-ai-cannot-replace-in-a-gym-member-experience
- Sidekick struggles with multi-step requests.
- Android Hinglish speech recognition: "dizzy" came back as "डीसी" (written-out letters D and C). https://hackernoon.com/testing-androids-on-device-speech-recognition-with-hindi-english-code-switching (2 Oct 2026)
- I found no real Reddit or G2 threads complaining about gym owner AI assistants. Treat the complaint evidence as thin.

### Ranked tasks for a small Indian gym owner (GUESS, built from the evidence above)
Value: H/M/L. Risk: R = read-only; D = changes data; $ = changes money records; S = sends to members or staff.

| # | Group | Example request (Hinglish) | Value | Risk |
|---|---|---|---|---|
| 1 | Members & renewals | "Is hafte kiska plan khatam ho raha hai?" | H | R |
| 2 | Messaging | Renewal reminder to everyone expiring in the next 7 days | H | S |
| 3 | Money | "Kitna collection hua is mahine, kitna baaki hai?" | H | R |
| 4 | Money | Polite dues reminder to members who owe money | H | S (tone matters) |
| 5 | Messaging | "Sab members ko Diwali ki badhai + 20% offer" | H | S |
| 6 | Members | Add a new member from speech ("Rahul, 3 mahine, ₹4,500 cash") | H | D + $ |
| 7 | Money | Record a payment (cash or UPI) for a member | H | $ (highest risk) |
| 8 | Attendance | "Kaun 10 din se nahi aaya?" (at-risk list) | H | R |
| 9 | Messaging | Win-back message to members inactive 14+ days or expired in the last 30 days | H | S |
| 10 | Messaging | Gym closed or timing change notice (holiday, power cut) | H | S |
| 11 | Members | Renew, extend or freeze a plan | H | D + $ |
| 12 | Plans | Create an offer or plan ("3+1 month Diwali offer, ₹X, till 15 Nov") | H | D (pricing) |
| 13 | Marketing | Festival or offer poster for Instagram/WhatsApp status, with caption | M-H | none (download only) but costly image generation |
| 14 | Money | Plan-wise revenue, this month vs last month | M | R |
| 15 | Attendance | Peak hours and today's crowd | M | R |
| 16 | Members | One member's details: last visit, dues, plan end | M | R |
| 17 | Staff | Trainer-wise PT clients, sessions, commission | M | R |
| 18 | Staff | Assign a member to a trainer | M | D |
| 19 | Messaging | Birthday wishes for today | M | S |
| 20 | Messaging | Draft a reply to a member's complaint or question | M | S |
| 21 | Marketing | Referral campaign ("dost lao, 1 mahina free") | M | S + D |
| 22 | Marketing | Ask happy members for a Google review | M | S |
| 23 | Plans | Draft a workout or diet plan for a member | M | S (health: trainer reviews first) |
| 24 | Setup | "UPI/GST/biometric kaise set karu?" (how-to) | M | R |
| 25 | Setup | Change gym timings or holidays in settings | M | D |
| 26 | Staff | Message staff about shift changes or a meeting | L-M | S (staff) |
| 27 | Insights | "Gym ka haal kya hai is hafte?" (weekly summary) | M | R |
| 28 | Marketing | Write a Hinglish caption and hashtags | L | none |

Build order (GUESS): read-only questions 1, 3, 8, 14–17, 24, 27 first (cheap, safe, most used). Then message drafts 2, 4, 5, 9, 10 (the main value; preview plus Send). Then data and money actions 6, 7, 11, 12 with a confirm card showing exact field changes. Posters last (image generation cost).

## B) Pricing credits by task size

| Vendor | How cost varies by task | Source |
|---|---|---|
| Zapier (Jun 2026) | One shared pool. AI steps cost 1x/3x/5x tasks (Standard/Advanced/Premium model). New steps default to Advanced (3x), so tasks run out faster. MCP call = 2 tasks. Agents have a separate "activities" quota. | https://help.zapier.com/hc/en-us/articles/46597632373389 |
| HubSpot | Credits per feature, listed in a catalogue. Moved to outcome-based pricing (about $1 per lead, $0.50 per resolved conversation). Added spend caps. | links in section A |
| Intercom Fin | $0.99 per resolution. Complaint: an "assumed" resolution (customer just left) is billed, which leads to surprise bills after busy months. | https://intercom.com/pricing ; https://www.eesel.ai/blog/fin-ai-pricing |
| Freshworks Freddy | $49 per 100 sessions. A session = 24h chat window. Packs expire at the end of the billing cycle. 500 free sessions once. | https://crmsupport.freshworks.com/support/solutions/articles/50000004664-freddy-ai-agent-sessions-faqs |
| Canva | Shared monthly AI pool (about 500 Pro / 50 Free). Sources disagree on per-feature cost (1 vs 4–8 credits per image). Video is a small separate allowance. | https://www.eesel.ai/en/blog/canva-ai-pricing |
| Notion | Custom Agents $10 per 1,000 credits from 4 May 2026. Credits "based on the work needed". **No per-task number published.** | https://www.notion.com/help/custom-agent-pricing |
| Cursor (Jun 2025) | Fixed request count changed to dollar credits. Backlash, CEO apology and refunds (Jul 2025). | https://techcrunch.com/2025/07/07/cursor-apologizes-for-unclear-pricing-changes-that-upset-users/ |
| Replit (2025) | "Effort-based" pricing: cost known only after the task. Anger; one user went from $180–200 to $1K a week. | https://www.theregister.com/2025/09/18/replit_agent3_pricing/ |

**What users complain about:** cost known only afterwards (Replit). Charged for outcomes they did not get (Intercom "assumed"). Expensive default tier (Zapier). Unclear switch from counts to credits (Cursor). Credits that expire (Freshworks).

**Best practice for MettleUp (recommendation):**
1. Fixed price per task type, never per token. E.g. small = question/lookup 1 credit; medium = one draft or one data change 2–3; large = broadcast to many members, monthly report, or poster 5–10. (Numbers are GUESSES to tune from real cost.)
2. Show the price before running and again on the button: "Send to 142 members — 3 credits". Show the balance on the same card.
3. Charge only when a draft is successfully produced (or on Send). Charge nothing for errors, clarifying questions or "I can't do that". Undo/cancel within the preview is free.
4. Voice is free to the owner. It costs us about ₹0.1 per command (see C).
5. Low-balance warning, a monthly cap the owner sets, and credits that never expire (Sarvam and Freshworks show both models; expiring credits are a known complaint).
6. A usage history in plain words: date, what was asked, credits.

## C) Hindi/Hinglish voice input
Rates in INR use $1 ≈ ₹88 (GUESS exchange rate). A typical owner command is 10–20 seconds.

| Option | Price | Hinglish quality evidence | Notes |
|---|---|---|---|
| Browser Web Speech API (hi-IN / en-IN) | Free | No published benchmark. hi-IN writes English words in Devanagari ("offer" → ऑफर, GUESS from known behaviour). Android mis-heard "dizzy" as "डीसी". Vendors say browser engines struggle with code-switching. | Works on Chrome desktop and Chrome Android (77+). Audio goes to Google's cloud with no contract with us. On-device mode (`processLocally`, Chrome 139+) exists, but platform support varies. Not on Firefox or Opera. Brave unverified. No word-boosting for member names. https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally |
| **Sarvam Saaras v3/v4** | **₹0.49/min** pay-as-you-go (₹0.45 Pro, ₹0.41 Growth), billed per second. ₹100 free credit that never expires. 15-second command ≈ ₹0.12 | Sarvam's own figures: 19.3% WER on IndicVoices against about 24.5% for gpt-4o-transcribe and about 26.1% for Gemini 3 Pro. Built for code-mixed speech. **No independent Hinglish-only number.** | REST takes up to 30 s per request; batch up to 2 h. Modes: `codemix` (English in Latin, Hindi in Devanagari), `translit` (all Roman), `translate` (to English), auto language detection. WebSocket streaming with interim text; latency claim under 150–250 ms (vendor). Indian company (GUESS: data stays in India; confirm). https://docs.sarvam.ai/api/getting-started/pricing ; https://docs.sarvam.ai/api-reference-docs/getting-started/models/saaras ; https://sarvam.ai/blogs/asr |
| Google Cloud STT Chirp 3 | About $0.016/min (≈ ₹1.4); dynamic batch $0.003 (not live) | No Hinglish number found | Most expensive live option. https://cloud.google.com/speech-to-text/pricing |
| OpenAI gpt-4o-transcribe / mini | $0.006/min (≈ ₹0.53) / $0.003 (≈ ₹0.26). Newer gpt-transcribe $0.0045 (one source) | About 24.5% on IndicVoices (Sarvam's chart) | One source says the gpt-4o transcribe models retire 26 Feb 2027 (unverified). https://costgoat.com/pricing/openai-transcription |
| Gemini | Gemini 3.5 Transcribe about $0.005/min blended (≈ ₹0.44); Live version about $0.009/min. Or send audio straight to Gemini 3.5 Flash-Lite ($0.30 per 1M audio tokens, roughly 25–32 tokens/s, so about $0.0005/min) and get understanding plus the draft in one call | Gemini 3 Pro about 26.1% (Sarvam's chart). Custom vocabulary biasing on Transcribe (useful for member names) | https://aistudio.google.com/docs/pricing (fetched 12 Nov 2026) |
| AI4Bharat IndicConformer | Free, MIT licence | No official Hindi WER. Writes in native script (GUESS: English words come out transliterated) | Needs NeMo and GPU hosting that we would run ourselves. Not worth it at our scale. https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual |
| **Claude (Anthropic API)** | n/a | n/a | **No audio input.** The features overview (fetched 12 Nov 2026) lists vision (images) and PDFs, not audio. Transcribe first, then send the text to Claude. https://platform.claude.com/docs/en/build-with-claude/overview |

**Recommendation:** use Sarvam Saaras (REST, `codemix` or `translit` mode) as the default. Its claimed Indian-language accuracy is the best, the cost is about ₹0.12 per command, the company is Indian, and it handles Hinglish. Use gpt-4o-mini-transcribe or Gemini 3.5 Transcribe as a fallback if Sarvam is down. Before locking the choice, run a 30-clip test on real owner recordings with gym words (member names, "renewal", "PT", "dues", ₹ amounts). Every option costs under ₹0.6/min, so accuracy should decide. Always show the transcript in the preview so a misheard name or amount is caught before Send. Keep Web Speech API only as a free fallback.

## D) Indian rules
- **TRAI TCCCPR (anti-spam rules)** covers telecom calls and SMS. The Feb 2025 2nd Amendment left out OTT apps such as WhatsApp. A draft 3rd Amendment (13 Mar 2026) touches third-party apps; IAMAI argues TRAI has no power over apps. I found nothing saying an app's own push notifications count as "commercial communication". **In-app or push messages from a gym to its own members appear to be outside TRAI (GUESS, not legal advice).** https://www.khaitanco.com/thought-leadership/Efforts-to-Curb-Spam-Continue-TRAI-Releases-Second-Amendment-to-the-TCCCPR-2018 ; https://indianinfrastructure.com/2026/03/16/trai-releases-draft-telecom-commercial-communication-preference-third-amendment-regulations-2026-for-consultation/
- **DPDP Act 2023 + Rules (notified 13/14 Nov 2025):** phased in. Consent-manager rules from Nov 2026. **The main duties (notice, consent, withdrawal, purpose limits) apply from about 13 May 2027.** The gym is the data fiduciary; MettleUp is its processor (GUESS on roles). Build now: a separate consent tick for offers and promotions at member signup, a one-tap "stop offer messages" in the app, a record of who agreed, and never sending member data to the AI beyond what the task needs. https://www.azbpartners.com/bank/update-indias-digital-personal-data-protection-framework-comes-into-effect/
- **Google Play:** notifications about an app's own offers are allowed (an airline announcing deals is the policy's own example). Ads in notifications and promoting other apps are banned. The gym's offer to its own members fits (GUESS: keep it clearly from the gym). Android 13+ members can turn notifications off. https://support.google.com/googleplay/android-developer/answer/9899004
- **WhatsApp Business (if ever added):** only approved templates can be sent outside the 24-hour customer-service window. India's marketing rate went up on 1 Jan 2026 from ₹0.7846 to ₹0.8631 per delivered message (about ₹1.0–1.1 with provider fee and GST). Billing has been per message since 1 Jul 2025. Per-user marketing limits apply in India (error 131049; India pilots saw 30–50% fewer marketing messages delivered). A reply from the user opens a 24h window where marketing messages don't count. https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing ; https://whautomate.com/whatsapp-business-api-pricing-india ; https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/
