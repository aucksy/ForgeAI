# F201 — AI assistant for gym owners, paid with AI credits

Resume folder for this job (rule: keep-a-resume-folder-for-long-jobs). A new session starts here.
Backlog row: F201 in docs/OWNER-INBOX.md (it absorbs F110, "AI assistant for the owner").

## His words (verbatim)

12 Nov 2026, the idea:
> I want you to add this as an idea and I want your opinion basis your detailed analysis and research that if the the third plan that we have top tier plan of AI plan should be keep that or we replace that with a functionality where the gym owners can buy credits and perform agentic AI actions on their dashboards... instead of keeping it as the largest plan, what if we just let people recharge their credits... and even the BasicPlan users or the ProPlan users can also use the agentic functionality...

12 Nov 2026, the go-ahead:
> Ok, I want you to implement this but do it accurately and very thoroughly and the biggest piece will be for you to design this agentic AI. I told you one use case but you can think about all the possible use cases and all the possible tasks that can be done. I guess when the user enables this and puts some tasks into it we give them probably a list of most common use cases so that they understand how to use it right and and I wonder if it's gonna be typing plus voice, so the voice gotta be good so they can just speak in Hindi, that if all members have Diwali, happy Diwali, you can send a message or go and it will create it and then show it and have it sent on the app. So just think it through very, very carefully and implement it very, very carefully. Take your time and let's do it. Let's make this thing. You're the boss. You make all the right decisions.

12 Nov 2026, same turn:
> And you can of course update all the places where we have the AI plan mentioned and replace it with this new offering that we have. And about your task thingy, you're saying that $299 is equal to 100 tasks. Do you think each task will cost same?

My answer to the cost question: no. Tasks differ (a question ~Rs 0.3, a group message ~Rs 0.5-1, a trainer plan ~Rs 1.5-3, voice +Rs 0.1-0.3). Plan: fixed credits per task TYPE, shown before Send.

## Standing limits that apply

- Payments stay in test mode until he says "payments live".
- No LIVE database change (migration) without his explicit yes.
- Privacy / public website wording needs his yes (names and phones go to the paid AI).
- User-facing AI = Claude (the $100/month API credit); HQ-only AI = Gemini. Member data never through a free Gemini key.
- UI design starts on the Claude Design canvas (rule ui-design-starts-in-claude-design).
- Every platform: owner panel is web; member app shows the message (Android + iPhone parity line).
- Cloud builds only; push straight to main; update every test the change touches.
- Never release/publish the app without his "release".

## Status

- [x] Idea row F201 + my view (pushed 926d8d99, tracker v402)
- [ ] Code map (helper) -> 01-code-map.md
- [ ] Research: use cases, credit pricing, Hindi voice (helper) -> 02-research.md
- [ ] Design spec: tasks catalogue, safety model, credits, voice, screens -> 03-design.md
- [ ] Claude Design canvas for the screens
- [ ] Build: server (migration, AI worker, credits ledger), panel UI, member app delivery
- [ ] Replace every "Pro + AI" mention
- [ ] Tests + cloud CI + UAT pictures
- [ ] His yeses: live migration, privacy wording, prices

## Where everything is

| What | Where |
|---|---|
| This folder | docs/f201-ai-assistant/ (worktree D:\Apps\ForgeAI\wt-f201) |
| Earlier analysis | docs/CLAUDE-NOTES.md R-376 / R-377; inbox rows F110, F201 |
