# A5-phone-components-2-1 checkpoint

F-phone-1400: 10 journeys, 14 type lines
F-phone-1401: 10 journeys, 14 type lines
F-phone-1402: 12 journeys, 14 type lines
F-phone-1403: 10 journeys, 14 type lines
F-phone-1404: 10 journeys, 14 type lines
F-phone-1406: 8 journeys, 16 type lines
F-phone-1407: 10 journeys, 16 type lines

Done: all 7 features, 14 feature x role pairs. Output: docs/system-map/_work/out/A5-phone-components-2-1.jsonl (173 rows: 70 journeys, 102 type lines, 1 finding).

## Entities
- F-phone-1406 (notice cards) and F-phone-1407 (couldn't-save banner): no entity fits. They read/write only phone-local state (meta key notice_rest_day, the in-memory save-problem store, the live workout draft); entities.json holds no phone-local workout or meta entity. writes/reads left empty; type lines use "unknown".
- Help questions kept on the phone (AsyncStorage 'help_questions') mapped to E-feedback (the server copy of the same question and replies).

## Could not check
- What a "pass member" sees differently: the feature rows list the role, but nothing in these files branches on it. Pass-member journeys mirror the member ones; whether a pass member gets the plan-ends notice or a gym key (AI credits) is unknown.
- Whether the Sheet unmounts the voice composer when closed mid-recording (Sheet component not opened; size limit).

## Seen in passing (not findings)
- HelpReply: when an AI answer has no id (older help box), tapping No shows "Got it. We reply as soon as we can." but nothing is sent or kept (HelpReply.tsx:27-31).
- HelpQuestions polls the help box once a minute for as long as the page is open, even with no questions on the phone (HelpQuestions.tsx:68-79).
- A rating tapped offline is kept on the phone but never re-sent (feedback.ts:153-168).
- noticeSlot: a card that unmounts never reports want=false, so the tab could keep picking it; cards appear always mounted, so not proven.
