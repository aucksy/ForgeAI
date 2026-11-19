# A5-panel-assistant-2 checkpoint

Output: docs/system-map/_work/out/A5-panel-assistant-2.jsonl (115 rows: 43 journeys, 70 type lines, 2 findings). All 9 items done.

F-panel-914: 4 journeys, 8 type lines
F-panel-913: 4 journeys, 8 type lines
F-panel-915: 6 journeys, 7 type lines
F-panel-905: 3 journeys, 9 type lines
F-panel-907: 5 journeys, 7 type lines
F-panel-909: 4 journeys, 8 type lines
F-panel-908: 4 journeys, 8 type lines
F-panel-912: 8 journeys, 7 type lines
F-panel-906: 5 journeys, 8 type lines

Findings: FN-A5-panel-assistant-2-01 (Today credits pill label says credits, opens the assistant), FN-A5-panel-assistant-2-02 (idea tapped on Today is dropped when the assistant is busy or at the daily limit).

Entities: no entity fits "the chat on screen" (turns kept in the browser) or "today's question allowance"; left out. Members and visits are linked as E-crm-records (the panel's synced rows). Messages sent from an idea: E-gym-messages.

Seen in passing (not findings):
- Voice sheet: the "too short" and "nothing was heard" lines say "Try again", but the only button is Close; the owner must close and tap the microphone again (ui/VoiceSheet.tsx:107-110).
- History and the credits sheet ask for the newest 30 tasks only; nothing says older ones exist (ui/AssistantHome.tsx:447). A spend older than 30 tasks falls back to the server's note in Recently used.
- History failed line has no retry button; leaving the tab and coming back retries (ui/AssistantHome.tsx:455).
- Members' AI section: closing the sheet with an unsaved limit gives no warning (ui/CreditsSheet.tsx:237-260).
- Tapping a Try saying sentence replaces whatever was typed in the box, with no warning (ui/AssistantHome.tsx:234-238).
- Time in History shows no year (ui/AssistantHome.tsx:482-488).

Could not check:
- The server side (the wallet, question counts, member rules save, the 400-day delete, voice daily minutes and its refusal words): not read, no database call allowed in this step.
- Exact words shown when the voice allowance is used up and when a card needs more credits (they come from files outside my entry points).
- Whether each journey has a test: coverage left "unknown" for every row.
- Anything on a real screen: code read only.

Code lines read: about 1,900.
