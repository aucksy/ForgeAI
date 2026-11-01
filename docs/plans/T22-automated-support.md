# T22 Automated support and fixes: the plan (#33) — 1 Nov 2026

Plan only. No code changed. For the owner's OK.
Goal: an AI answers gym owners and members, every problem is logged, and repeat problems become
fixes that Claude Code builds, tests and releases. Promise to gyms stays "We reply as soon as we can."

## 1. What exists today (most of the plumbing is already built)
- **Send feedback, both apps.** Members tap a floating button on any screen, or Settings → Send
  feedback, and type or tap Speak (Hindi or English). Owners use More → Send feedback in the admin app.
- **Speak turns voice into text** on our server through Groq's free Whisper. Nothing is kept.
- **One feedback box** in Cloudflare's free database. No name or mobile number. Kept 1 year.
- **Crash reports, both apps.** Scrubbed of emails, phones and keys. Kept 90 days.
- **A daily robot** opens one GitHub issue per new kind of crash. Another checks every 10 minutes
  that the website, admin app, HQ and gym server are up, and emails the owner if one is down.
- **HQ (hq.mettleup.fit)** lists feedback, crashes and data-delete requests, with a status per message.
- **A sorting routine** for Claude: read new messages, mark bug / idea / question / praise / spam,
  fix bugs through the full test gate, release by risk (low risk to all; risky to testers first).
- **A paid AI key path** already runs in the admin app's member import (Gemini, then Claude Haiku).
- **Gaps:** nobody gets an answer back (feedback is one-way). No help articles. No support
  WhatsApp number in either app. Sorting is manual, when a session happens to run it.
- **Found a wording problem:** the privacy notice says crash text goes to "our private bug list on
  GitHub". The code repo, and so its issues, is public. The text is scrubbed, but the words are wrong.

## 2. The recommended system: 4 parts
**Part A: "Help" with an AI answer, inside both apps.** The feedback sheet becomes "Help and
feedback". The person types or speaks. The AI answers in seconds, in their language, from a short
set of help articles we write (how to take a payment, renew, check in, import, log a workout).
- They see: an answer, then "Did this solve it? Yes / No". "No" logs it as a problem and says
  "Got it. We reply as soon as we can." A real reply shows later in the same sheet.
- The AI never promises money, refunds, dates or features. It never reads gym or member records.
  It sees only the words typed, the screen name and the app version.
- Gym owners also get a "Chat on WhatsApp" link to the owner's own number, for human help.

**Part B: every problem logged and grouped.** Each message (answered or not) lands in the existing
feedback box. Twice a day a scheduled Claude Code run on the owner's PC groups repeats ("5 gyms
cannot print a receipt"), marks each one, and drafts replies for HQ.
- The owner sees: in HQ, a short daily list: new problems, repeats, and replies to approve.

**Part C: repeats become fixes.** A problem seen 3+ times, or any crash, becomes a GitHub issue
written in Claude's own words (never the member's text: the repo is public). Claude Code picks the
issue, fixes it, runs all tests, and ships on the existing release-by-risk route. The person who
reported it gets "Fixed in the next update" in their Help sheet.
- The owner sees: the fix in the "What's new" notes, and the issue closed. He approves releases as now.

**Part D: help articles that grow.** Each question the AI could not answer becomes a new help
article draft. So the AI answers more over time and fewer messages need a human.

Not recommended now: a WhatsApp AI bot (needs Meta setup, a business number and paid replies;
worth it at 10+ gyms), and Sentry or Crashlytics (our own crash reports already do the job free).

## 3. Monthly cost in rupees (₹88 to the dollar; prices read 1 Nov 2026)
Guess: about 30 help questions a month per gym, each reading about 6,000 word pieces (tokens) and writing 400.
| | 1 gym | 10 gyms | 100 gyms |
|---|---|---|---|
| AI answers, Claude Haiku 5.5 (about ₹0.07 each) | ₹2 | ₹20 | ₹200 |
| Same on Gemini 3.1 Flash-Lite, paid (about ₹0.18 each) | ₹5 | ₹50 | ₹500 |
| Grouping and fixing (Claude Code on his existing plan) | ₹0 | ₹0 | ₹0 |
| Database, crash robot, GitHub issues (free tiers) | ₹0 | ₹0 | ₹0 |
| WhatsApp AI bot (not recommended yet) | — | — | about ₹0-1,000 |
| **Total recommended** | **about ₹2** | **about ₹20** | **about ₹200** |
- A hard daily cap in the server stops a runaway bill (as the import already does).
- WhatsApp: Meta gives 1,000 free reply messages a month per number; more cost money from
  1 Oct 2026, plus a reseller fee (₹999+ a month) unless we connect to Meta directly.
- At 100 gyms the fixing runs may need a bigger Claude plan; check usage then.

## 4. Build order
1. **Help with AI answers** (Part A + help articles): the AI on our Cloudflare server with a paid
   key and a daily cap; the "Did this solve it?" step; 10-15 starter articles. About 3-4 days.
2. **Replies and the daily list** (Part B): replies shown back in the app; a scheduled run that
   groups, marks and drafts replies; the HQ daily list. About 2-3 days.
3. **Repeats into fixes** (Parts C + D): the 3-repeat rule opens issues in Claude's words; the
   "Fixed in the next update" note; unanswered questions become article drafts. About 2 days.
Each step goes through the normal test gate and ships in the next batch release he approves.

## 5. Decisions only the owner can make
1. **Privacy wording.** Add one line: "Help questions go to Anthropic (Claude) to write an answer.
   Anthropic does not train on them. Kept 1 year." And change "private bug list" to "our bug list
   on GitHub, with personal details removed". **Recommended: approve both.**
2. **Paid AI key.** Use a billed key only (free AI tiers may learn from what people type), with a
   cap of ₹500 a month. Real spend at 1-10 gyms is about ₹2-20. **Recommended: yes, Claude Haiku.**
3. **WhatsApp AI bot.** Now, or at 10 gyms? **Recommended: at 10 gyms.** Until then the admin app
   links to your own WhatsApp for human help, and the AI lives inside the apps.

## 6. Sources
- Gemini prices, and "free tier content used to improve products": https://ai.google.dev/gemini-api/docs/pricing
- Claude Haiku 5.5 prices: https://platform.claude.com/docs/en/about-claude/pricing
- WhatsApp pricing (1,000 free service replies; charges from 1 Oct 2026): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- WhatsApp India rates and reseller fees: https://www.robylon.ai/blog/whatsapp-business-api-pricing-india , https://myoperator.com/blog/whatsapp-business-api-pricing-india-2026
- Sentry free plan (1 user, about 5,000 errors): https://costbench.com/software/developer-tools/sentry/free-plan/
- Crashlytics on Expo needs native setup: https://reactnativerelay.com/article/react-native-firebase-expo-analytics-crashlytics-2026
- Hevy: three in-app routes (bug, help, feature request) plus email: https://help.hevyapp.com/hc/en-us/articles/34161316169239-Bug-Report-Get-Help-and-Feature-Request-What-is-the-Difference
- Wodify: help centre plus live chat 10 am-4 pm US time: https://help.wodify.com/hc/en-us/articles/6625033123223-Contact-Wodify-Support
- Gymdesk channels (email, help base, phone, chat): https://www.capterra.in/compare/148663/159663/martial-arts-on-rails/vs/wodify
- GymMaster: WhatsApp line, YouTube tutorials, AI helper "Gymmy": https://gymmaster.com/support , https://www.gymmaster.com/blog/introducing-gymmy-gymmaster-ai-powered-companion/
- Indian desk software, phone and chat 9 am-9 pm: https://yourstory.com/companies/fitgymsoftware
- Issues to fixes with Claude Code on GitHub: https://code.claude.com/docs/en/github-actions
- Not found: support details for Gymshim or Zenoti's small-gym plans; Fitbase is a Russian product.
