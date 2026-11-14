# AI on the gym page, and what else AI credits are for (R-520)

Research only, 14 Nov 2026. Nothing here is built. The gym page itself ships with **no AI helper** (owner, R-519).

## 1. The short answer

- **Is anyone else doing an AI helper that sells memberships on a gym's website?** Yes. The big US and global gym
  software companies already sell it, and so does at least one Indian gym software company. The owner's "nobody else
  does it" is not true as a whole.
- **What is still rare:** a *free* gym page with an AI helper paid per use from credits, for small Indian gyms, that
  only repeats the gym's own prices and offers. Everyone found either hides the price ("book a demo") or sells it
  inside a monthly plan.
- **Cost per chat:** about **₹0.10 to ₹0.25 for a 6-question chat** on Claude Haiku 5.5 (see section 3). At the
  planned rate of 20 questions = 1 credit (about ₹3), that chat earns about ₹0.90. The money works.
- **Biggest risk is not cost, it is trust:** an AI that invents a discount or a "last 2 spots" line breaks India's
  dark-pattern rules and the gym's name. Rules for it are in section 4.

## 2. Who already does it (checked 14 Nov 2026)

| Company | What it does | Price seen | Source |
|---|---|---|---|
| Mindbody "Messenger[ai]" | AI answers website chat, texts and missed calls; sells "packages and memberships via text and webchat"; books classes | Not public (demo only) | mindbodyonline.com/business/fitness/messenger-ai |
| ABC Glofox "AI agents" | Website chat agent "trained on your pricing, hours, and policies"; sends booking and membership links; a Sales Agent follows up leads; 30+ languages; claims 6-10x more leads captured | Not public | glofox.com/features/ai-agents |
| Zenoti | AI receptionist for gyms and studios (calls, chat) | Not public | zenoti.com |
| Easy Gym Software (India) | "Easy AI" on WhatsApp, website and calls, "AI-powered lead qualification", plus a free website with plans | Software from ₹799 | easygymsoftware.com/ai-gym-bot |
| AiSensy (India) | Ready-made "gym membership agent" for WhatsApp | WhatsApp plan pricing | aisensy.com/whatsapp-ai-agent-library/gym-membership-agent |
| iNextLabs (Bangalore) | Case study of a gym chatbot for leads | Custom | inextlabs.ai |
| PushPress, Gymdesk, Wodify | Website builders and lead forms; no AI sales chat found on their pages. Gymdesk's June 2026 post says none of 23 owners it interviewed switched software for AI | n/a | pushpress.com/grow, gymdesk.com/features/website, wodify.com |

What visitors complain about on gym websites, which an AI helper would answer: **hidden prices** ("doesn't list their
prices and I don't feel like talking with a salesperson", biglittlegyms.com; twobrainbusiness.com/prices-gym-website),
vague buttons and too many equal offers (pushpress.com/blog/what-gym-websites-get-right). Our page already shows the
prices, so the AI's job would be the questions a price list cannot answer: "Is there a ladies batch?", "Can I try one
day?", "Is there parking?", "Which plan for weight loss?".

## 3. What a chat costs (Claude Haiku 5.5)

Price used: Claude Haiku 5.5 (`claude-haiku-5-5`, already used by F201 assist), $0.10 per million words-in (tokens)
and $0.50 per million out; a cached prompt is read at $0.01 per million and written at $0.125 per million (5-minute
cache). From the Claude API price sheet as cached on 3 Nov 2026; **check the live price before building**. ₹88 = $1.

One chat, assumed: the gym's facts (plans, prices, timings, offers, rules) about 3,000 tokens, sent as a cached
system prompt; each question about 80 tokens; each answer about 150 tokens; thinking switched off; 6 questions.

| | With caching | Without caching |
|---|---|---|
| First question | $0.00045 | $0.00043 |
| Each later question | $0.00016 | $0.00045 (grows as the chat grows) |
| Whole 6-question chat | about $0.0013 (₹0.12) | about $0.0026 (₹0.23) |
| Per question | about ₹0.02 | about ₹0.04 |

Caching mostly helps *inside* one chat (questions seconds apart). Between two visitors of one small gym, the
5-minute cache usually runs out, so plan on the "first question" price for every new visitor.

Revenue side: a credit is about ₹3 (₹149 for 50). At 20 questions per credit, a question earns ₹0.15 against a cost
of ₹0.02 to ₹0.04. Even a chatty visitor (15 questions) costs under ₹0.60 and earns ₹2.25.

Caps needed anyway: at most 20 questions per visitor per day, at most N chats a day per gym (owner sets N, default
50 = 2.5 credits a day at most), stop when the gym's credits are 0 and show the normal "Ask the gym" form instead.

## 4. Rules for an AI sales helper (if built later)

1. **Only what the owner set.** Prices, plans, timings and offers come from the gym's records, sent fresh each chat.
   The AI may not invent a discount, a free trial, a "today only" price or a refund rule. If asked for something not
   in the facts: "I'll ask the gym" and turn it into an enquiry.
2. **No false urgency** (India CCPA Guidelines for Prevention and Regulation of Dark Patterns, 30 Nov 2023, 13
   patterns incl. false urgency, basket sneaking, confirm shaming, nagging; under s.18 Consumer Protection Act 2019).
   No countdown clocks, no "only 2 spots left" unless the owner set a real limit and the count is real.
3. **The "offer when leaving"** (owner's idea): allowed only as a real offer the owner made, shown once per visit,
   closed with one tap, with no shaming words ("No thanks, I don't want to get fit" is confirm shaming). Never stop
   the visitor leaving. Recommend: test it on a few gyms before turning it on for all.
4. **Phone numbers only with consent** (DPDP Act 2023; DPDP Rules notified 13-14 Nov 2025, main notice and consent
   duties from about 13-14 May 2027): ask before taking the number, say who gets it (this gym) and why (to reply), an
   unticked box, and delete on request. Our "Ask the gym" form already does this.
5. **Says it is an AI.** First line: "I'm the gym's AI helper. I can answer about fees, timings and the gym."
6. **No health advice** beyond "talk to the trainer or a doctor"; no diet or injury advice from the page bot.
7. **Hand-over:** every chat that ends with a phone number becomes an Enquiry with the chat attached, like the
   question form.

## 5. What else owners should spend AI credits on (ranked)

Credits today (F201): 1 credit per message sent or member/payment saved by the AI, 3 per AI workout plan; planned:
20 questions = 1 credit for every AI question (owner, member or page visitor). Ranks are a judgement, not measured.

| Rank | Use | Earns money | Keeps members | Saves time | Rough credits |
|---|---|---|---|---|---|
| 1 | **Renewal reminders that write themselves**: for each member expiring in 7 days, a personal WhatsApp in Hindi or English with the plan and the UPI link | High (renewals are the gym's main income) | High | High | 1 per message; a 150-member gym sends about 15 a week = 60 a month |
| 2 | **Reply to every enquiry the same day** (walk-ins, page questions, Instagram): AI drafts the reply and the 2-day follow-up | High (enquiries that get a fast reply join more often) | n/a | Medium | 1 per message; 20 enquiries a month x 2 = 40 |
| 3 | **Win back members who stopped coming** (no visit for 10 days, or expired 30 days ago): a personal note from the trainer | Medium | High | Medium | 1 per message; about 20 a month |
| 4 | **First-week workout plan for every new member** (from the gym's own exercise list) | Low directly | High (new members who get a plan stay longer) | High for trainers | 3 per plan; 10 new members = 30 a month |
| 5 | **"Ask your numbers"** for the owner: "who has not paid this month?", "how many renewals next week?" | Indirect | Indirect | High | 20 questions = 1 credit; about 2 a month |
| 6 | Festival and offer messages (Diwali, New Year), written once, sent to a chosen list | Medium, seasonal | Low | Medium | 1 question to write + 1 per message sent |
| 7 | Writing the gym page's "About" words and photo descriptions | Low | n/a | Low, once | under 1 credit, once |
| 8 | Unpaid dues reminders with the UPI link | Medium | Low (can annoy) | Medium | 1 per message |
| 9 | The page's AI sales helper (sections 3-4) | Medium (unproven) | n/a | Medium | 20 questions = 1 credit; about 5-15 credits a month for a busy page |

My view: build 1 and 2 first (they earn the most and use data we already have); the page AI helper (9) is worth a
trial only after the plain page and its question form show how many visitors a gym's page really gets.

## Sources (all read 14 Nov 2026)

- Mindbody Messenger[ai]: https://www.mindbodyonline.com/business/fitness/messenger-ai
- ABC Glofox AI agents: https://www.glofox.com/features/ai-agents/
- Easy Gym Software AI bot: https://easygymsoftware.com/ai-gym-bot
- AiSensy gym membership agent: https://aisensy.com/whatsapp-ai-agent-library/gym-membership-agent
- PushPress, what gym websites get right: https://www.pushpress.com/blog/what-gym-websites-get-right
- Gymdesk website feature: https://gymdesk.com/features/website
- Two-Brain Business, prices on a gym website: https://twobrainbusiness.com/prices-gym-website/
- CCPA dark patterns guidelines, 30 Nov 2023 (summary): productgrowth.in; check the Gazette notification before relying on wording.
- DPDP Rules 2025 timing: yourstory.com, storyboard18.com, legal500.com, mondaq.com coverage of the 13-14 Nov 2025 notification.
- Claude prices: the Claude API price sheet (claude-api skill, cached 3 Nov 2026).
