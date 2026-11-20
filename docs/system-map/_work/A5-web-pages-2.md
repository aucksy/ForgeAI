# A5-web-pages-2 checkpoint

F-web-110: 9 journeys, 15 type lines
F-web-111: 6 journeys, 7 type lines
F-web-107: 6 journeys, 18 type lines
F-web-105: 12 journeys, 14 type lines
F-web-106: 5 journeys, 7 type lines
F-web-117: 16 journeys, 32 type lines
F-web-118: 24 journeys, 28 type lines
F-web-120: 4 journeys, 8 type lines

All 8 features done. Output: docs/system-map/_work/out/A5-web-pages-2.jsonl (212 rows; merge --dry: 0 rejected, 0 with gaps).

No entity fits: What's new feed (GitHub file + Cloudflare cache), Get the app / APK redirect, /dl/ bundles: those journeys list no writes/reads.
Entity guesses: the friend and self-join enquiry is E-crm-records (0056/0077 insert into crm_records).
Member and admin app button words for feedback/help/speak taken from string search ('Help and feedback', 'Send', 'Did this solve it?', 'Speak'), screens not opened.

Seen in passing (not findings):
- voice.js: the clip is counted before the speech service is called, so a failed or busy call still uses one of the member's 20 daily clips.
- friend.html: the address-limit refusal says "Too many requests from this link today", but the limit is per network address, not per link.
- /dl/ fetches GitHub release files with no token; if the repo is private every download 404s (not checked).
- assetlinks.json lists one certificate fingerprint for both packages; whether it is the Play signing key was not checked.
- help.js header still says 20 questions = 1 credit; questionCredits.js says 10 answers = 1 credit (comment only).

Could not check: the member/admin app screens for feedback and help (outside web/pages); live behaviour of any page.
