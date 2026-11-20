# A5-server-database-2-3 checkpoint
F-server-419: 16 journeys, 33 type lines
F-server-420: 15 journeys, 33 type lines
F-server-421: 8 journeys, 16 type lines
F-server-422: 17 journeys, 22 type lines
F-server-423: 10 journeys, 15 type lines
F-server-424: 9 journeys, 15 type lines
F-server-425: 12 journeys, 24 type lines
F-server-426: 8 journeys, 16 type lines
DONE: 8 of 8 features, 22 pairs. 95 journeys, 174 type lines, 2 findings, 271 rows.

Seen in passing (not sure enough for a finding):
- F-server-420: the workout of the day shows members the setter's FULL staff name (by_name = staff name, 0051:159/134); Ask a trainer shows only "Rohit S." (0053:101-109).
- F-server-422: questions are deleted 180 days after they were ASKED and only on the next read (0053:291, 0053:323); promises P-A7-help-1-22 / P-A7-pilot-78 say 180 days after the last message.
- F-server-424: the pass check-in rule ignores passSince and an archived list member (0055:52-55), so a pass member is "OK" before the pass starts.
- F-server-426: header says only the desk-confirmed number (0048) is used; the code reads checkin_phone with no confirmation check of its own (0057:11, 0057:29). Depends on 0048, not read.
- Later replacements not read in full: 0074 (Ask a trainer NO_PLAN) and 0085 (friend known number); journeys cite their headers only.
Entities: E-pay-requests lives in Cloudflare D1, used for F-server-426; nothing missing.
Could not check: the Worker, restore script and app screens (outside the items' entry code); none driven.
