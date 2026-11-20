# A5-phone-screens-2-3 checkpoint
F-phone-219: 13 journeys, 7 type lines (download and restore files are phone-only: no entity fits)
F-phone-222: 9 journeys, 7 type lines (phone data has no entity; E-gym-members used for the gym leave)
F-phone-220: 7 journeys, 7 type lines (files and text are phone-only: no entity fits)
F-phone-223: 9 journeys, 7 type lines
F-phone-217: 10 journeys, 7 type lines (seen in passing: the trainer switch lives only on What my gym can see, whose Settings row shows only once the leaderboard answered)
F-phone-221: 7 journeys, 8 type lines (import screens read by header only, as the feature row says; workouts live on the phone, no entity fits)
F-phone-212: 7 journeys, 8 type lines
F-phone-224: 4 journeys, 8 type lines (reads no entity)
seen in passing: Help and feedback send() has no try/finally; if saving the question on the phone throws, 'Sending' stays up and Send stays locked until the page is left (apps/mobile/src/app/settings/feedback.tsx:43-64; whether the history store can throw was not checked).
seen in passing: code says a gym's AI credit pays for 20 member questions (apps/mobile/src/lib/feedback.ts:247), What's new promise P-A7-whats-new-1-38 tells owners 10 answers use 1 credit.
seen in passing: Help and feedback also sends the member's gym key to the gym server (feedback.ts:249); P-A7-pilot-83 lists only "your gym's code".
seen in passing: 'Bring back my workouts' on the account card has no busy state of its own (apps/mobile/src/components/settings/AccountCard.tsx:98).
seen in passing: Save my history / Save my measurements guard with a state flag, not a ref (BackupCard.tsx:125,163), so a same-frame double tap may run twice.
seen in passing: the trainer share switch (on by default) is only on What my gym can see, whose Settings row shows only once the gym leaderboard answered this session (GymSettings.tsx:76); without a leaderboard a member may not reach it from Settings.
entities: phone-only data (workouts, backup files, CSVs) has no entity; left out.
could-not-check: nothing ran (analysis only); import screens read by header only as the feature row says.
