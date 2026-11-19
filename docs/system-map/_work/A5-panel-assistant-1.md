# A5-panel-assistant-1 checkpoint

Output: docs/system-map/_work/out/A5-panel-assistant-1.jsonl (124 rows: 58 journeys, 63 type lines, 3 findings). All 9 items done.

F-panel-910: 5 journeys, 7 type lines
F-panel-901: 7 journeys, 7 type lines
F-panel-917: 6 journeys, 7 type lines
F-panel-916: 6 journeys, 7 type lines
F-panel-903: 8 journeys, 7 type lines
F-panel-902: 7 journeys, 7 type lines
F-panel-904: 6 journeys, 7 type lines
F-panel-911: 7 journeys, 7 type lines
F-panel-900: 6 journeys, 7 type lines

Code lines read: about 2,520 of 3,000.

## Entities with no fit (left out)
- Enquiry and expense saved by asking: no entity of their own; E-crm-records used (its text names gym, member, plan, membership, payment, visit, workout plan only).
- The receipt made for a member's payment: E-gym-receipts is MettleUp's receipt to a gym, so it was not linked.
- The WhatsApp list after a message: stays on the device, no entity.

## Seen in passing (not written as findings)
- apps/dashboard/src/crm/assistant/ui/Cards.tsx:325 always says "Free. Questions never use credits." and AssistantHome.tsx:299 always says "No more free questions today", while AssistantHome.tsx:228 and allowance.ts:68 have a counted mode ("Every {n} AI questions use 1 credit"). The two would contradict each other on one screen if that mode is ever on. Not sure it is on anywhere.
- AssistantHome.tsx:85: when today's questions are used up, a tap on a "Today for you" row (disabled only while asking, line 203) or on a follow-up button does nothing and says nothing.
- allowance.ts:30: the count and the lock live only in the open page. After a reload the box is open and no "left" line shows until the next answer or refusal.
- answer.ts:493 and suggestions.ts:140: "Fees due: {n} members" reads "1 members" for one member.
- match.ts:69: a name in letters other than Latin or Devanagari (Gujarati, Bengali, Tamil) gives an empty key, so that member can never be found by name.
- match.ts:173 with answer.ts:475: an archived member is not matched, so the card offers "Add {name} as a new member" (a second record for the same person).
- match.ts:114: names of 5+ letters one letter apart count as the same ("Suresh" / "Sudesh"); with only one of them on the list it is picked without asking. The card does name the member in bold.
- match.ts:165 with 177: the five choices are cut in list order before members with a running plan are put first.
- mask.ts:18: the browser's phone pattern misses Hindi digits and numbers split by " - "; the server masks again (deploy/panel/assist.js:623, 667-677), so no leak was seen. The server pattern itself was not read.
- useConversation.ts:126: the request saved for History is the sentence as typed, with the phone number in it (kept 400 days as the notice says).
- context.ts:79-88: every question also carries the gym name, plan names and prices, batch names and trainers' first names; the notice (P-A7-legal-2-07) speaks only of what the owner types or says.
- useConversation.ts:218: the plan writer's exercise list is built from the gym's existing workout plans; what a gym with none gets was not read.

## Could not check
- The menu entry for the AI Assistant and what the assistant address shows to staff: the menu and route files are outside the entry points; only AssistantFab.tsx:92 (route "assistant") was read.
- Exact words for offline, slow, no-credit-for-a-question and paused lines (constants at the top of api.ts, not read), the card titles (CARD_TITLE), the send-later button words, the rewrite limit number and the third-message warning words.
- conversation.ts (how the chat is kept between page loads), VoiceSheet.tsx, CreditsSheet.tsx, TodayAiCard.tsx, festivals.ts and the birthday request sentence: not read (size limit kept in reserve).
- Server side of the daily limit, spend and refund (panel worker and database functions): not read; no database call was made.
- Nothing was driven on a screen and no test file was opened: every journey has coverage "unknown".
- Whether staff of a second gym can see anything: needs a second test gym.
