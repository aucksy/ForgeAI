# Problem families (No Gaps, gate G0)

Made 27 Nov 2026 from the full audit: 2511 findings (raw, before duplicates) in 309 cause families, joined into 25 master families. Each finding is in exactly one family. The owner's notes (docs/OWNER-OBSERVATIONS.md) are placed too. Data: FAMILIES.json.

A fix is always made for a whole sub-family, with its guard, never for one finding alone.

| Id | Family | Worst | Findings | Sub-families | Owner notes |
|---|---|---|---|---|---|
| M02 | Privacy promises vs real data flows | S1 | 91 | 7 | O-24 |
| M01 | Release and store truth | S1 | 73 | 15 | - |
| M05 | Identity, sign-in and member photo | S1 | 32 | 9 | O-14, O-17, O-38 |
| M13 | Test and demo data on the live system | S1 | 29 | 6 | - |
| M22 | Consent, age and terms | S1 | 11 | 3 | - |
| M24 | The test system itself | S2 | 599 | 25 | - |
| M11 | Failures hidden from people | S2 | 176 | 12 | - |
| M12 | Jobs, services, storage and load unwatched | S2 | 171 | 19 | O-25 |
| M16 | Screen words, help and 'say it once' | S2 | 149 | 19 | O-08, O-09, O-10, O-12, O-15, O-16, O-36 |
| M14 | Messages, alerts and badges | S2 | 142 | 21 | O-22, O-26 |
| M15 | Sync between phone, watch, cloud and devices | S2 | 125 | 28 | O-01, O-02, O-05 |
| M04 | Delete, erase, backup and restore scope | S2 | 108 | 16 | - |
| M10 | Same number counted different ways | S2 | 95 | 12 | O-11 |
| M08 | Paid features, limits and AI credits | S2 | 94 | 15 | - |
| M07 | Payments, receipts and refunds | S2 | 68 | 14 | - |
| M06 | Membership and gym billing state | S2 | 66 | 14 | O-18, O-20 |
| M09 | Server trusts the client; roles | S2 | 61 | 14 | - |
| M17 | Dates, time and the calendar | S2 | 49 | 7 | - |
| M21 | Owner operations and keys | S2 | 41 | 5 | O-27 |
| M03 | Personal data leaving the system | S2 | 17 | 7 | O-28 |
| M19 | Touch, reading and accessibility | S3 | 160 | 27 | - |
| M18 | Internal notes, maps and dead code | S3 | 97 | 9 | - |
| M20 | Shared rules copied per feature | S3 | 50 | 3 | - |
| M23 | iPhone port | S3 | 7 | 2 | - |
| M25 | Owner feature requests | - | 0 | 0 | O-03, O-04, O-06, O-19, O-21, O-23, O-29, O-30, O-31, O-32, O-33, O-35, O-37, O-39 |

## M02 Privacy promises vs real data flows (worst S1, 91 findings)

**Cause:** Privacy and legal words are typed by hand, so they drift from what the app really does with data.

**Guard that closes it:** Privacy words are built from one list of data flows; a check fails when a flow has no sentence.

**Owner notes:** O-24

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| A-01 | New data flows, outside companies and stored items ship without anyone updating the privacy notice or terms, because there is no list of where data goes that is checked against the notice. | 21 | S1 | full |
| B-03 | Privacy promises (what stays on the phone, what the gym, desk or AI never sees) are written in words but no shared test watches what actually leaves or shows. | 31 | S2 | full |
| A-07 | Privacy sentences on screens and websites ('never sent', 'not kept', 'we never message you', 'only on this phone') are typed once by hand and not worked out from the real sharing switches and stored copies. | 13 | S2 | full |
| C-07 | The privacy notice and on-screen data promises are typed by hand instead of being built from the list of what is actually sent, stored or shared, so they understate what leaves the phone. | 9 | S2 | full |
| A-12 | Website, store listing and join-page claims about product behaviour are written by hand and not re-checked when a feature changes or is retired (Drive backup, messages, renew, reminders, switching offer). | 9 | S2 | full |
| D-21 | Privacy and legal words were written without checking where data really goes (backups, uploads, payment store), so they promise more than is true. | 6 | S2 | full |
| C-74 | Screens offer or promise things that were never built (a WhatsApp send, a trainer-teaches view, a limit-raise tool), because words were written ahead of the feature with no check that it exists. | 2 | S3 | full |

## M01 Release and store truth (worst S1, 73 findings)

**Cause:** What we say shipped is not checked against the store, and release checks miss paths.

**Guard that closes it:** A release cannot be marked shipped until the store shows that version; release checks cover every path.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| D-01 | Releases are recorded as shipped without checking that the store actually published them, so fixes and notes reach members late or not at all. | 5 | S1 | full |
| A-16 | Words about which watch and phone apps exist (watch on public Play, Apple Watch, iPhone coming soon, which watches work) are written by hand and not tied to what is really released. | 6 | S2 | full |
| B-21 | The release and CI workflows' safety stops are written as workflow text with no self-test run on every push. | 14 | S3 | full |
| D-43 | Sends are marked done when they are handed over, not when they really succeed, so failures are never retried and screens say 'sent' too early. | 9 | S3 | full |
| D-49 | CI checks can show green while testing nothing (skipped, warn-only, re-run, never triggered). | 8 | S3 | standard |
| C-34 | The release checks prove only one path (last release, stock emulator, GitHub copy, phone without watch, one deploy order), so other real update and release paths ship unproven. | 7 | S3 | full |
| A-44 | Google Play rules (target version, unused permissions, Android 15 bars, outside update path, trader status) are not checked before release. | 5 | S3 | standard |
| A-45 | Old What's new and update notes are never retired or re-checked, so they name old pages, describe things backwards and contradict each other. | 5 | S3 | light |
| A-56 | Server change files say by hand whether they are live, and nobody updates them after they are applied. | 3 | S3 | standard |
| C-52 | Database change files are not safe to run again and the live state is not checked against them, so re-running an old step undoes later ones. | 3 | S3 | full |
| A-62 | Fixes are announced in What's new before they are proven on the phone that had the problem. | 2 | S3 | standard |
| C-70 | What's new notes are written by hand with no check against the real behaviour or the app they ship in, so they can say the reverse of what happens or repeat the phone's notes for the watch. | 2 | S3 | standard |
| D-72 | Cloud run setup is copied by hand into each run, so fixes and versions drift. | 2 | S3 | standard |
| D-81 | A test message was left live in every gym's bell. | 1 | S3 | standard |
| B-41 | What's new dates are stored without a year, so new-feature dots come back a year later. | 1 | S3 | standard |

## M05 Identity, sign-in and member photo (worst S1, 32 findings)

**Cause:** A typed phone number is trusted as identity; sign-ins never expire; people are matched by fragile keys.

**Guard that closes it:** Identity comes only from a checked sign-in; one matching rule; sign-ins can expire and be revoked.

**Owner notes:** O-14, O-17, O-38

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| A-02 | A typed mobile number is trusted as a person's identity with no proof it is theirs and no way to change it, so recycled numbers, strangers and look-alike names can take over sign-in, messages and enquiries. | 8 | S1 | full |
| D-17 | People are matched by names, first words or per-sign-in accounts instead of one stable key, so the same person becomes two records or loses data. | 7 | S2 | full |
| A-22 | Facts are read from free-text names (plan names, friend names, exercise names) instead of fixed ids. | 4 | S2 | full |
| A-42 | Sign-ins and keys (panel, device, HQ, shop key, phone session) have no expiry and cannot be ended from the server, and the phone session sits in backed-up storage. | 5 | S3 | full |
| C-55 | PIN set, change and sign-in each carry their own rules and words, so a saved PIN can be followed by a wrong error and a change lock does not grow. | 3 | S3 | full |
| A-61 | A gym's join code is the only thing needed to join its member app, yet it is shown on the public page and has no wrong-try limit. | 2 | S3 | standard |
| B-42 | The alerts key request to HQ has no time limit, so a slow HQ hangs it. | 1 | S4 | full |
| C-97 | The gym sync sign-in card has no forgotten-password path. | 1 | S4 | full |
| D-93 | A background check forces sign-in when the session ends and throws away what was being typed. | 1 | S4 | full |

## M13 Test and demo data on the live system (worst S1, 29 findings)

**Cause:** Test gyms and demo data sit on the live server and are not flagged.

**Guard that closes it:** Test data lives only in a test project, or carries a flag every report skips.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| C-01 | Test gyms are made on the live server and recognised by their name, so a real gym with a 'QA' name can be deleted and old-brand test gyms are visible. | 2 | S1 | full |
| D-16 | New rules apply only to new records, with no backfill for existing members or data. | 8 | S2 | full |
| B-34 | The sales demo's pretend server is never exercised by pressing buttons, so its acted-out actions, refusals, badges and reset are unchecked. | 7 | S3 | full |
| D-68 | Demo workouts are not flagged in one place, so widgets, exports and counts treat them as real. | 3 | S3 | standard |
| C-49 | The demo gym re-implements real gym rules in its own fake layer, so its counts, limits and approvals drift from the real gym. | 3 | S3 | full |
| D-87 | One-time repairs and import markers depend on reads that can fail and leave no trace, so repairs rerun, fail silently or delay start-up. | 6 | S4 | full |

## M22 Consent, age and terms (worst S1, 11 findings)

**Cause:** Consent and age are not recorded; the under-18 stop leaves saved data; terms acceptance has no history.

**Guard that closes it:** One consent record with date and version; the under-18 stop removes server data too.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| D-02 | The under-18 stop only blocks new saving; it does not remove what is already stored or update the status line. | 2 | S1 | full |
| A-20 | Consent, opt-outs and age are not recorded: joining keeps no notice or 18+ record, age is a fixed number, minors can be added, default sharing has no lawful basis and members cannot opt out of offers. | 5 | S2 | full |
| D-65 | Terms acceptance is captured only once at join, never re-asked on change, not re-openable and not read by HQ. | 4 | S3 | full |

## M24 The test system itself (worst S2, 599 findings)

**Cause:** Screens, roles, failures and refusals are never driven by a test; some tests cannot fail.

**Guard that closes it:** Shared test tools for phone, panel, watch and server; a test that cannot fail is itself a failure.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| B-01 | The admin panel and HQ have logic tests but no rule that every page, sheet, card and button is opened and pressed in a browser test, so whole screens are never driven. | 72 | S2 | full |
| B-02 | Screen and server tests sign in as the owner only; there is no shared way to replay them as front desk, trainer, staff, demo or a member who left, so other roles are never checked. | 47 | S2 | full |
| B-04 | Some tests pass while the feature is broken: they read the code's text, test a helper no screen uses, take a picture without checking it, make a check optional, run where the page is replaced, feed no data, or accept any count. | 24 | S2 | full |
| B-05 | Tests run at one fixed moment, so expiry windows, day limits, midnight in India, keep times and 'after N days' rules are never exercised. | 20 | S2 | full |
| B-09 | The phone app's rules are tested as data but there is no rule that every screen, sheet, card and button is opened and pressed in a device test, so whole screens are never driven. | 74 | S3 | full |
| B-10 | Form checks and refusal words on phone, panel and web forms are scattered per screen, so tests type only good values. | 41 | S3 | full |
| B-11 | Phone tests never make a save, read or server call fail, so failed saves, load errors, empty pages and no-internet states are never seen. | 38 | S3 | full |
| B-12 | The written journeys and the tests are kept separately and nothing ties a test's expectation to an agreed rule, so they contradict each other and some tests lock in behaviour nobody decided on. | 32 | S3 | full |
| B-13 | Panel tests use a fake server that always answers, so failed saves, no internet, empty lists, loading and not-online states are never seen. | 32 | S3 | full |
| B-14 | Error, refusal and hint words live as strings no test reads, so the exact words members and staff see are never checked. | 27 | S3 | full |
| D-28 | Many screens and services have no test that runs them, only tests that look for words in the code, so breakage goes unseen. | 24 | S3 | full |
| B-15 | Alerts, bell lines, pop-ups and phone notifications are built in many places with no shared test of who gets them, what they say, where they open and when they stay quiet. | 22 | S3 | full |
| B-16 | Tests always say yes and go forward; Cancel, Back, Not now and backing out are never pressed. | 22 | S3 | full |
| B-17 | Server functions' refusals and edge cases are never listed, so database tests cover only the accepted case. | 19 | S3 | full |
| B-18 | Server functions and HQ routes are added without a rule that each has a database or route test, so whole calls, lists and saves are never exercised on the server. | 16 | S3 | full |
| B-19 | Nothing simulates the app being closed, restarted, updated, reloaded or restored part-way, so recovery paths are never run. | 15 | S3 | full |
| B-22 | The watch app has almost no screen or service tests, so its buttons, taps, phone hand-off and sensors are never driven. | 13 | S3 | full |
| B-23 | Phone and watch notifications and reminders are posted from several services and no test posts one and reads back its words, lock-screen content, channel, tap route or schedule change. | 12 | S3 | full |
| B-24 | Test gyms have one branch, so anything that changes with two or more branches (tiles, imports, timings, PINs, visitors) is never tried. | 12 | S3 | full |
| B-27 | Save, start and share buttons each handle busy state on their own and no test ever presses them twice. | 9 | S3 | full |
| B-28 | Settings are read once at start and no test flips them on and off (or while a screen is open) and checks the effect. | 9 | S3 | full |
| B-31 | Nightly clean-ups, scheduled runs and automatic starts are tested, if at all, on one row and only when every step works. | 7 | S3 | full |
| B-32 | The public gym-server addresses and relay pass-through are tested only for their main page, not headers, unknown addresses or upgrades. | 7 | S3 | full |
| A-53 | Tests start from an empty database and a single fresh path, never from last version's data, re-runs, passing time or every payment company. | 4 | S3 | standard |
| B-43 | The rule that hides a note line repeating the workout name, meant for imported workouts, runs on every workout and hides the member's own first line. | 1 | S4 | standard |

## M11 Failures hidden from people (worst S2, 176 findings)

**Cause:** Errors are caught and dropped, or a failed read looks like a real empty answer.

**Guard that closes it:** One report helper logs every failure; a failed read shows a clear 'could not load' state.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| D-03 | Failures are caught and either shown as 'try again' or kept only on the device, with no shared reporter that writes a log line and sends it to MettleUp, so breakage is invisible until a gym complains. | 45 | S2 | full |
| D-04 | When a read fails, the code falls back to a default (empty, zero, none, all clear, paid, not demo) that looks like a true answer, so screens and decisions act on a guess. | 35 | S2 | full |
| D-08 | An action fails and the user is shown nothing, or is told it worked, because the failure path has no message. | 18 | S2 | full |
| C-02 | A failed read or call is drawn as an ordinary state (empty, not found, offline, switched off, nothing to do) because screens have no shared loading/failed/empty helper that keeps failure separate. | 18 | S2 | full |
| C-06 | One fixed message is used for several real situations (saved vs handed over, PIN vs code, preview vs saved, which folder), because the screen does not pick its words from the actual result. | 9 | S2 | full |
| D-30 | Screens pick their error words from one catch-all guess instead of the real kind of failure, so a server fault, a shared limit or a full store is shown as 'no internet', 'switched off', 'you used too much' or a vague error. | 23 | S3 | full |
| C-25 | Failures the apps catch themselves (saves, imports, sign-in, native alerts, watch crashes) are shown calmly but never reach MettleUp, because the crash report path is used only for uncaught crashes. | 10 | S3 | full |
| C-28 | A save or action that fails is caught and dropped with no word to the person, because each screen handles its own errors instead of going through one shared save helper that shows the failure. | 8 | S3 | full |
| B-35 | Rules trim, cut or leave out what a person typed or chose without saying so, and tests lock that silence in. | 4 | S3 | full |
| D-67 | Crash reporting covers only the JavaScript side and sends only when online, and its alert ignores repeats, so native and offline crashes are missed. | 3 | S3 | standard |
| C-63 | Save handlers return early at the free limit without clearing their busy state, so Save keeps spinning. | 2 | S3 | full |
| C-98 | The anti-robot box value is not passed on in one of the PIN reset paths. | 1 | S4 | full |

## M12 Jobs, services, storage and load unwatched (worst S2, 171 findings)

**Cause:** Background jobs, outside services and limits have no alarm; polling and storage have no budget.

**Guard that closes it:** Every job and outside service has a health alarm; polling, storage and page size have budgets.

**Owner notes:** O-25

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| D-06 | Automatic jobs, senders and outside services (WhatsApp, AI, payment keys, backup) have no heartbeat the outage alarm checks, and some health checks answer 'fine' when they cannot read, so a stopped job goes unnoticed. | 18 | S2 | full |
| D-11 | Screens poll on fixed short timers with no back-off or stop, and static files go through the worker, using up the shared free request limit. | 12 | S2 | full |
| D-12 | Server data grows with no per-gym size budget and no scheduled cleanup, so one gym or old data can fill the free database or store. | 10 | S2 | full |
| D-15 | Free-tier and paid limits have no early warning to MettleUp, so the first sign is a failure. | 9 | S2 | full |
| D-14 | Browser and phone stores have no size budget or early warning, so a full device silently drops data. | 9 | S2 | full |
| D-22 | Public or anonymous paths have no per-caller or total cap, or their cap switches off quietly when its store fails. | 5 | S2 | full |
| D-29 | Screens and saves recompute from the whole history on every open, tick or save instead of keeping running totals, and nothing times this against big data. | 24 | S3 | full |
| D-35 | No product usage events are recorded anywhere central, so activation, day-30 use and feature uptake are unknown and some progress lives only in one browser. | 17 | S3 | full |
| D-37 | Database links and filters have no index and the database check never asks for index advice, so reads scan whole tables. | 15 | S3 | full |
| C-24 | Nightly jobs, keys, outside services and devices can stop working with only a hidden log line, because nothing records each part's last good run where HQ's health check reads it. | 11 | S3 | full |
| D-45 | Pages ship as one big download with blocking fonts and late pictures, and nothing checks page speed on a phone. | 9 | S3 | full |
| A-38 | Nothing checks the apps' libraries for known security holes, so flagged spreadsheet, navigation, sharing and watch libraries ship. | 6 | S3 | standard |
| D-61 | Bulk work and page loads send requests one after another instead of in one batch. | 4 | S3 | full |
| D-64 | Outside calls are made with no time limit, so a stalled line leaves screens waiting for ever. | 4 | S3 | full |
| A-51 | Cloud build runs pull outside code by moving versions, paste typed inputs into commands, have unlimited access passes and print account details to public logs. | 4 | S3 | standard |
| D-74 | The pop-up sender sends a fixed number per minute, so big gyms wait and late pop-ups are dropped. | 2 | S3 | full |
| D-76 | The app's update check and update notes read GitHub, not the store the member installed from. | 2 | S3 | full |
| D-86 | Long lists draw every row and pictures are drawn full size, with no virtualising or small previews. | 6 | S4 | full |
| D-88 | Screens hold the processor or screen awake and redraw too often, and battery use is never measured. | 4 | S4 | full |

## M16 Screen words, help and 'say it once' (worst S2, 149 findings)

**Cause:** Screen words, help articles and messages drift from what the app does, or repeat what the screen shows.

**Guard that closes it:** Words come from one word list; help is checked against screens; an 'i' only for an exception.

**Owner notes:** O-08, O-09, O-10, O-12, O-15, O-16, O-36

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| C-03 | Each screen writes its own 'contact MettleUp / tell your gym' line, often with no number, link or fallback, because there is no shared support-contact component. | 15 | S2 | full |
| D-26 | Screen and help words are written once and not re-checked when the feature changes, so they promise or name things that are not true. | 27 | S3 | full |
| C-19 | Hinglish covers only the screens whose words were wrapped in the language lookup, and nothing fails when a new line is left unwrapped or a Hinglish line is wrong. | 15 | S3 | full |
| C-21 | Help articles are written by hand apart from the screens and the help check covers only some folders, so help lags, contradicts or skips live features. | 13 | S3 | full |
| C-22 | Screens and messages name menus, tabs and buttons by hand ('in Profile', 'tap Back up now'), so the words go stale when a screen or button moves or changes. | 12 | S3 | full |
| D-41 | Greyed-out controls show no reason, because there is no shared disabled-with-reason control. | 10 | S3 | full |
| B-30 | Screen words are written as fixed promises instead of being driven by the real state, so they claim things that are not true (saved, safe, a button that does not exist, a fixed 15 minutes). | 8 | S3 | full |
| C-37 | Internal names (database step numbers, 'old owner key', 'gym server', system prefixes, the old brand kind) reach people, because raw stored values and code words go straight into text with no plain-words layer. | 6 | S3 | full |
| C-43 | Counts are glued to a fixed plural word ('1 days', '1 members'), because there is no shared plural helper. | 5 | S3 | full |
| A-52 | Help articles quote buttons and questions by hand and nothing checks them against the screens. | 4 | S3 | standard |
| C-51 | Leads from the member app are sent once, thinly and unlabelled, because the lead path was built without retry, detail or a source label. | 3 | S3 | full |
| C-83 | The routine rest picker uses a fixed default instead of the saved one. | 1 | S3 | standard |
| C-89 | The welcome message to a new owner has no admin app address. | 1 | S3 | full |
| C-78 | The owner site offers in-person setup with no area limit. | 1 | S3 | light |
| C-85 | The booking sheet opens on the shown week even when it is over. | 1 | S3 | standard |
| C-90 | Screen text is typed in each screen instead of one shared word list, so the same thing has two, three or four names across screens and apps. | 20 | S4 | full |
| C-92 | House style rules (never 'OK', sentence case, plain true lines) are known but not enforced, so individual lines slip through clumsy or untrue. | 4 | S4 | light |
| A-70 | AI that writes offers or answers visitors is not told what it must not promise (body results, things the gym never wrote). | 2 | S4 | light |
| C-96 | The card draws its heading only once the member app is on. | 1 | S4 | light |

## M14 Messages, alerts and badges (worst S2, 142 findings)

**Cause:** Messages are sent without checking reach, can repeat, have no delivery record, and badges use the wrong signal.

**Guard that closes it:** One send pipeline: check reach, one request id, record delivery; badges read one state.

**Owner notes:** O-22, O-26

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| D-07 | There is no single rule for whether a member can get an app pop-up, so send screens say 'sent' or 'members see it' without checking who will really get it. | 18 | S2 | full |
| D-09 | Writes carry no once-only request id and taps are not guarded, so a retry after a lost answer, or a double tap, saves twice or is misread as a new or bad request. | 16 | S2 | full |
| D-10 | Pending items (requests, leads, prizes, stuck payments, questions) close only through their own button, so the same thing done another way leaves them open. | 12 | S2 | full |
| C-10 | Events that need someone to act (a booking change, a payment decision, an unanswered question, a waiting join, a stopped copy) have no alert, because alerts are added by hand per event with no list of who must know. | 7 | S2 | full |
| A-25 | Reminders and birthday wishes are assumed to reach the member's phone, with no check of Android's limits or whether the phone shows them. | 2 | S2 | full |
| D-39 | Sends keep no per-member delivery or seen record, so owners, HQ and MettleUp cannot see who got or read a message. | 12 | S3 | full |
| D-40 | Ideas, nudges and cards do not read the shared record of what was already sent, automated or finished, so they offer the same action again. | 12 | S3 | full |
| C-26 | Shown notifications and pop-ups have no 'close when the thing is done or changed' step, so stale notices stay or keep coming after the job, renewal, switch-off or erase. | 10 | S3 | full |
| C-27 | Each alert sets its own sound, vibration, channel importance and watch buzz, so OEM silencing, silent mode and the watch are handled for some alerts and not others. | 9 | S3 | full |
| C-32 | 'Not now', 'Skip' and close on cards and offers hide them for good without saying where to find them again. | 7 | S3 | full |
| C-39 | There is no one rule that decides when a pop-up may ring (quiet hours, urgent kinds, the daily allowance, grouping edits), so each sender rings at any hour and in any amount. | 6 | S3 | full |
| C-40 | The open admin app and HQ ring and pop up through their own in-page code, which skips the alert settings, the device switch and the browser's delivery limits. | 6 | S3 | full |
| D-57 | Read marks, badges and tray pop-ups are set by side signals (background counts, pushes) rather than by the member actually opening the item. | 5 | S3 | full |
| C-58 | Undo bars and saved notes vanish on a fixed short timer, and one is hand-made, so screen reader users and slow readers miss them. | 3 | S3 | full |
| C-57 | Refreshes are throttled by a time window alone, so a real change (a pop-up tap, new workout days) waits out or is thrown away by the window. | 3 | S3 | full |
| C-69 | Full-screen pop-ups (phone update, watch update, free month) decide on their own when to show, so one hides or blocks another for good. | 2 | S3 | full |
| B-37 | New-question and message alerts compare counts instead of ids, so a question that arrives just after another is answered makes no sound. | 1 | S3 | full |
| C-93 | Pop-up sends assume success (the address is cleared, the summary claimed, the renewed address ignored) instead of confirming hand-over, so some pop-ups are lost. | 4 | S4 | full |
| C-94 | Lines that promise a phone notification are written as always true, though delivery depends on the member's settings and the server path. | 3 | S4 | full |
| A-69 | Notification channels and their words were set once and not updated as new kinds of pop-up were added to them. | 3 | S4 | light |
| C-101 | Reply pop-ups put the message words on the lock screen. | 1 | S4 | full |

## M15 Sync between phone, watch, cloud and devices (worst S2, 125 findings)

**Cause:** State lives on one device, copies go stale, and changes are not pushed to every copy.

**Guard that closes it:** One owner for each piece of state; every copy is told of a change; versions are checked.

**Owner notes:** O-01, O-02, O-05

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| C-08 | Help questions, team replies, alert sign-ups, quick buttons and the shop key are kept per browser or phone instead of per gym and person, so they leak to the next user or are lost on another device. | 9 | S2 | full |
| D-24 | Reminders and cards act on an old copy on the phone with no freshness check. | 2 | S2 | full |
| B-20 | Pages read their data once and no test changes the data while they are open, so stale numbers after an add, delete or payment go unnoticed. | 15 | S3 | full |
| D-42 | Seen marks, ticks, language and notes are kept in one browser or phone instead of on the server, so other devices disagree. | 10 | S3 | full |
| D-46 | Work the phone does in the background (closed-app set ticks, Health deletes, leave notes, ratings, late replies, record rebuilds) has no durable outbox, so one failure or a closed app loses it or delays it for hours. | 9 | S3 | full |
| D-50 | Whether someone is new is guessed from install or join dates, so long-time members get new-member treatment and new ones get upgrade notes. | 8 | S3 | full |
| D-51 | The app reads only its own switches, not the phone's notification, channel, Do Not Disturb or battery settings, so it says alerts are on when the phone blocks them. | 8 | S3 | full |
| D-53 | Door machine commands and uploads are fire-and-forget with no acknowledged queue, so failed or unreadable ones are lost and lapsed members can keep entry. | 7 | S3 | full |
| A-34 | Saves have no request id, version check or single-step write, so double taps, dropped connections and two desks at once save twice or undo each other. | 7 | S3 | full |
| D-54 | The watch keeps its own copies of phone settings and workout state with no sync rule, so switches and dedupe windows drift from the phone. | 6 | S3 | standard |
| D-55 | Edits and deletes on one side are not pushed to the copies held elsewhere (member app, gym mates, gym offer counts). | 5 | S3 | full |
| D-56 | The desk's offline queue does not handle final refusals, cancels with no answer, or weak lines, and buttons are not greyed offline. | 5 | S3 | full |
| C-46 | Phone, watch, older phones and the server talk without telling each other their versions, so a newer or older side silently loses data, buttons or the reason for a refusal. | 4 | S3 | full |
| D-62 | Gym plan sync to the phone has no clear merge rule for deleted or edited folders, so trainer changes are lost or lead nowhere. | 4 | S3 | standard |
| D-66 | Timed work (receipts, rest alarms, hold countdowns, quiet installs) runs only while a screen is open or the app is in front, so time promises are not kept. | 4 | S3 | full |
| A-58 | The phone-watch link rests on assumptions (one install signal, the newest row, a counter that only rises) that break in real use. | 3 | S3 | standard |
| C-53 | An admin or HQ tab left open keeps running the old version, because the page never checks for a new version. | 3 | S3 | full |
| D-69 | Linking a member found by number or invite to the gym list happens once and is not retried, so the member waits for a QR check-in. | 3 | S3 | full |
| C-73 | The watch keeps its own copy of set-entry rules (required weight, effort choices) instead of getting them from the phone. | 2 | S3 | full |
| A-63 | Some gym choices (set-up ticks, language) are kept in the browser, not with the gym on the server, so a new device or address loses them. | 2 | S3 | standard |
| C-67 | Deletes and repairs that touch several tables run as separate steps, so a close mid-way leaves data half gone. | 2 | S3 | full |
| C-77 | Putting a gym online copies once and does not send entries saved during the copy. | 1 | S3 | full |
| C-76 | Only the top branch list checks for unsent entries before switching. | 1 | S3 | full |
| A-65 | A watch update prompt hides after Back and leaves no lasting sign. | 1 | S3 | light |
| C-79 | The nightly door update runs inside the admin app instead of on the server. | 1 | S3 | full |
| C-80 | The watch keeps the last heart rate when the sensor says off-wrist. | 1 | S3 | standard |
| A-66 | The assistant history saves the AI's first suggestion instead of what the owner saved. | 1 | S3 | standard |
| C-100 | Start-up recovery ignores a rest that ended seconds before. | 1 | S4 | full |

## M04 Delete, erase, backup and restore scope (worst S2, 108 findings)

**Cause:** Each delete, erase or restore lists its tables by hand, so copies are missed or deleted accounts come back.

**Guard that closes it:** One list of where each person's data lives, used by erase, delete, backup and restore; a round-trip test.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| B-06 | There is no single list of every place a person's or gym's data lives, so erase, sign-out, leave and delete are never checked to clear all of them. | 19 | S2 | full |
| A-05 | There is no single list of every table and file that holds a person's or gym's data, so member erase, member delete and gym delete each forget some copies (photos, measurements, AI history, enquiries, shop copy, second database) or delete records that must stay. | 14 | S2 | full |
| A-08 | Keep-for limits promised in the notice are left to chance: some deletes only run when someone opens a screen and many tables have no clean-up at all, because no nightly job owns every stated limit. | 13 | S2 | full |
| C-04 | Deleting a gym, a member leaving and Erase each list by hand what to remove, so new stores are missed, some are kept too long and proof that must stay is deleted. | 11 | S2 | full |
| B-07 | Backup and bring-back are tested as separate words and steps, never as one round trip, so restore screens, Drive cards, repacked files and failed or half-saved backups go unchecked. | 10 | S2 | full |
| C-09 | Backups, exports and cloud copies each list by hand which kinds of data they include, so new tables, files, columns and photos are left out. | 7 | S2 | full |
| A-17 | Restore, replace and undo on the phone act only on the phone's workouts, unaware of the background cloud copy and of other record types, so undone data returns and counts are wrong. | 6 | S2 | full |
| D-19 | The nightly backup is not sized for growth, misses some tables and has never been restored for real. | 6 | S2 | full |
| A-23 | Copies of gym data kept on staff browsers and phones (set-aside copy, outbox, offline member list) have no end date and are not wiped when the person is removed or signs out. | 3 | S2 | full |
| A-24 | Excel import does not record what it changed in existing members (prices, filled details, app links, measurements), so undo removes or keeps the wrong things. | 3 | S2 | full |
| A-26 | The photo backup switch was moved out of reach, so members cannot turn it off. | 1 | S2 | full |
| A-35 | Erase, demo load and photo delete on the phone wipe a hand-picked list of stores, so photo folders, settings, trial dates, backup copies and the watch copy remain, and failures are hidden. | 7 | S3 | full |
| D-70 | Restore, erase and sign-in do not cover every piece of member state, so some choices survive or are lost. | 3 | S3 | standard |
| C-62 | The backup's own safety (one consistent moment, a separate place) is assumed rather than built and checked. | 2 | S3 | full |
| A-60 | The nightly backup is a full readable copy, including secrets and PIN fingerprints, with no separate key and no record of who looks at it. | 2 | S3 | full |
| B-40 | Restoring a backup brings back members who deleted their account since it was taken, and nothing re-deletes them. | 1 | S3 | full |

## M10 Same number counted different ways (worst S2, 95 findings)

**Cause:** The same count (visits, dues, streaks, progress) is worked out separately on each screen.

**Guard that closes it:** Each number has one definition in one place; every screen reads it.

**Owner notes:** O-11

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| D-05 | The same number (counts, records, kg, weeks, money) is worked out by separate rules in different places, so screens disagree. | 35 | S2 | full |
| C-05 | The same number (active members, ending this week, kg lifted, week goal, batch count) is counted separately on each screen, file and summary, so the same words show different numbers. | 11 | S2 | full |
| D-38 | Progress maths use fixed calendar windows and ignore the member's real training span (join date, partial weeks, long breaks, easy weeks). | 13 | S3 | full |
| A-29 | Each report, tile and summary defines its own count (visits vs members, archived included, fee vs total, GST, partial weeks, cancel time), so the same number differs between screens. | 10 | S3 | standard |
| D-52 | Whether a plan has started, ended, been renewed or is still owed is worked out separately on each screen, so dues, renewals and endings disagree. | 8 | S3 | full |
| A-32 | Money and weights are rounded in many places with different rules instead of one formatter, so paise vanish and kilos and pounds drift between screens and the watch. | 7 | S3 | standard |
| A-43 | Offers, rewards and leaderboards count activity the server never verified (fixed-code check-ins, back-dated or imported workouts, made-up kg, reused codes, taken-back check-ins). | 5 | S3 | standard |
| C-71 | The friend-reward already-given check is keyed on the friend's name, not the enquiry. | 2 | S3 | full |
| C-86 | The weigh-in typo check compares against the weigh-in being replaced. | 1 | S3 | standard |
| D-80 | The Strength score can fall with no explanation of why. | 1 | S3 | standard |
| D-79 | Muscles ready today names one workout but shows another's sets. | 1 | S3 | standard |
| D-77 | The body map lights the wrong shoulder heads for side raises. | 1 | S3 | standard |

## M08 Paid features, limits and AI credits (worst S2, 94 findings)

**Cause:** Plus, Pro and AI-credit rules are checked per screen or typed by hand; one caller can use up a shared limit.

**Guard that closes it:** One server-side check for every paid feature and limit; credits kept in one ledger.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| A-03 | Rate limits and AI caps are one shared bucket per day, gym or whole product with no per-caller limit (and the real caller address is lost behind our server), and some endpoints answer anyone, so one outsider can use them up or get free AI. | 18 | S2 | full |
| A-06 | Whether a member owns MettleUp Plus, its plan type, free month and staff unlock live only on the phone, with no server record checked with Google Play, so purchases are missed, double-charged, kept after they end or guessed. | 14 | S2 | full |
| A-14 | AI credit rules (what costs a credit, starter credits, monthly free numbers, pack prices) are typed by hand into the website, help, HQ and credits sheet instead of read from one price table. | 7 | S2 | full |
| B-25 | Which features are free, Plus, gym member or Pro is decided in several places and no shared test checks who gets each lock. | 11 | S3 | full |
| B-26 | Daily and hourly caps (questions, orders, messages, codes, crash reports, help) are each counted their own way and no test fills a cap to its edge. | 11 | S3 | full |
| A-33 | The hidden AI coach can be switched back on without safety rules, a report button, an app-side delete confirm, a live number check or a privacy-notice update, because no switch-on checklist exists. | 7 | S3 | full |
| A-41 | How many AI credits a task costs and when they come back is decided by the app or web caller, not by the server's ledger, so credits can be skipped, under-counted, charged for held-back answers or lost. | 5 | S3 | full |
| A-40 | MettleUp Plus is built but its launch rules (renewal and cancel words, refund rule, who counts as staff, gym cover versus free month) were never decided and written down. | 5 | S3 | full |
| A-47 | Plus limits are checked separately in each screen and entry point, so restore and chart ranges slip past and a mid-workout change is not passed on to the workout or watch. | 4 | S3 | standard |
| D-60 | AI spend is counted in some places and not others, so the monthly cost is wrong. | 4 | S3 | full |
| C-61 | Giving AI credits back is not tied to the task's real status, so a failed give-back leaves a task stuck and a worked task can still be refunded. | 2 | S3 | full |
| C-66 | HQ's AI limit form sends whole defaults instead of what was changed, so a blank box becomes 0 and trial limits are overwritten. | 2 | S3 | full |
| D-75 | Automatic and system messages draw from the gym's own daily member-message cap. | 2 | S3 | full |
| B-38 | The rule that a member needs classes left is checked only on the screen, so the server books personal training with none left. | 1 | S3 | full |
| D-89 | A spoken request that fails still uses up speaking time. | 1 | S4 | full |

## M07 Payments, receipts and refunds (worst S2, 68 findings)

**Cause:** A payment request is not one record; there is no refund state; cash and test mode fall through.

**Guard that closes it:** One payment record with every state, refund included; money words come from that record.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| A-09 | Whether a payment link or fee ask is open, paid online, expired, cancelled or failed is not one record every screen reads, so desk, shop, enquiry and member screens guess and show pay buttons, old UPI IDs or 'not paid' for money already taken. | 12 | S2 | full |
| A-10 | The money records have no refunded or reversed state, so cancelling an online-paid receipt or order, a double payment, an over-payment or a wrongly confirmed payment leaves no way to record that money went back. | 12 | S2 | full |
| A-13 | Whether a payment is test or live is not carried with each payment, so test payments create real plans, receipts, member alerts and 'Paid' lines, and help and HQ treat test as real. | 8 | S2 | full |
| A-18 | Cash taken on a desk without internet that the server later refuses (or never receives) has no proper state, so it vanishes from dues and counts, leaves receipt gaps or sits on a removed device unseen. | 5 | S2 | full |
| D-25 | The assistant's add-member card does not recompute the joining fee when the plan changes. | 1 | S2 | full |
| A-28 | Receipts, WhatsApp messages and hints each work out their own amounts, dates and plan names instead of reading one shared calculation, so they disagree with each other and the real plan. | 11 | S3 | full |
| C-30 | Words about how people pay (at the desk or online, UPI or company) are fixed text on each screen instead of being read from the gym's one payment setting, so they go wrong when online paying is on. | 8 | S3 | full |
| A-59 | Payment words in messages, invites and posters are fixed text ('pay at the desk', 'or on UPI') and do not read the gym's online-pay switch or saved UPI ID. | 3 | S3 | standard |
| C-72 | An offline or not-yet-confirmed receipt is handled differently on each payment screen, so one shows no receipt number and another lets it be sent. | 2 | S3 | full |
| D-73 | GST is split only when a receipt is printed, never stored, so monthly totals and exports cannot show it. | 2 | S3 | full |
| C-88 | A member paying the gym by UPI has no way to tell the gym. | 1 | S3 | full |
| D-82 | A free plan still offers online pay of zero rupees. | 1 | S3 | full |
| A-67 | Adding a GST number quietly makes every price GST-inclusive without telling the owner. | 1 | S3 | standard |
| B-39 | The server keeps a history of receipt changes that no screen ever shows the owner. | 1 | S3 | full |

## M06 Membership and gym billing state (worst S2, 66 findings)

**Cause:** Membership states (active, paused, ended, PT pack) are changed in many places without one rule.

**Guard that closes it:** One state machine for memberships, used by phone, panel and server; pause needs the owner's OK.

**Owner notes:** O-18, O-20

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| A-04 | A gym's plan, trial, branch and paid-until state is changed by many separate HQ and payment actions, each with its own logic, so hand plans, trials, branches, founding places and upgrades contradict each other and the promises. | 17 | S2 | full |
| A-11 | Member and gym status changes (leave, return, lapse, archive, pause, gym leaving) are not one state machine, so each feature handles them its own way and members stay archived, duplicate, lose marks or stay on machines and web pages. | 11 | S2 | full |
| D-13 | 'Stopped coming' counting ignores freezes, approved pauses, closed days and a new plan start, and is written by more than one rule. | 9 | S2 | full |
| D-18 | Personal training packs are stored as membership plans and not linked to trainers, so plan readers count them and trainers never hear of them. | 7 | S2 | full |
| C-12 | The gym's MettleUp plan state (waiting payment, plan switch, end reminder, open pay links) is decided in several places tied to online checkout, so UPI-paying gyms are treated wrongly. | 4 | S2 | full |
| C-14 | Disconnecting the shop does not close it on the server. | 1 | S2 | full |
| C-15 | Import reads a plan's length from the first number in its name. | 1 | S2 | full |
| B-33 | Gym-scoped data on the phone (logo, look, kept plan, hours, sync, what is sent) has no single owner, and no test moves a member from gym A to gym B. | 7 | S3 | full |
| A-54 | The gym Pro pack switch is off and, when on, is enforced only on new rows and on the device, so Starter gyms keep Pro pages and the website sells them as Pro-only today. | 3 | S3 | full |
| C-64 | The forgotten-workout pause depends on the app being open and on timers that are only opened, so the workout keeps counting. | 2 | S3 | full |
| C-81 | The chart's opening range skips the free-plan check that later range changes run. | 1 | S3 | full |
| C-87 | Un-pause sets a fixed status instead of restoring the gym's earlier one. | 1 | S3 | standard |
| A-68 | Past pass visits read the member's current pass company instead of the one saved at the visit. | 1 | S3 | standard |
| D-90 | The assistant's wallet check is not reset when the owner switches gym. | 1 | S4 | light |

## M09 Server trusts the client; roles (worst S2, 61 findings)

**Cause:** The server accepts what the panel or phone sends and does not shape answers by role.

**Guard that closes it:** The server checks role and gym on every call; tests try the call as the wrong person.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| A-15 | The server accepts role-limited actions and values (pass member, every-branch, door dates, offline flag, back-dated check-ins, option prices) exactly as the admin app sends them, so desk limits exist only on screen. | 7 | S2 | full |
| A-19 | The data agreement promises every look at a gym's records is recorded and shown, but direct database reads, master-key reads and reads past a cap are not recorded and the record keeps raw query text. | 5 | S2 | full |
| D-23 | Screens ship before the server part they call exists live, so a missing server piece reads as 'switched off' or a feature that does nothing. | 4 | S2 | full |
| C-13 | Emergency access to a gym's records was built without matching the owner-facing promise or telling the owner, so the words promise consent that the button does not need. | 3 | S2 | full |
| C-16 | Pass visits do not store the pass company at check-in, so history is read from the member's current pass. | 1 | S2 | full |
| A-30 | There is no rule that every gym-scoped call gets a test proving another gym or member is refused, and the read-everything test checks empty tables. | 10 | S3 | standard |
| B-29 | Privileged actions write log rows but tests never read them back, and one action writes none. | 8 | S3 | full |
| C-44 | Who may see or do what (desk vs owner, branch access, pause rules) is decided screen by screen instead of from one permission rule. | 5 | S3 | full |
| A-50 | Picture storage rules and upload tickets are not tied to one gym or to published pages, so tickets are reusable, drafts can be listed and another gym's logo can be used. | 4 | S3 | full |
| A-48 | The entry-machine link was built before a trust design: machines are identified by serial alone, punches can carry any date, and the link would be unencrypted. | 4 | S3 | full |
| D-58 | The owner's access list and the HQ log read a fixed list of actions, so new kinds of look or change are left out. | 4 | S3 | full |
| B-36 | Server reads return the same answer to every caller instead of shaping it by who asks, so the desk or a stranger learns more than their role should. | 3 | S3 | full |
| D-71 | Branch-level and gym-level settings are not clearly scoped, so a change hits one branch only or a member is blocked at others. | 2 | S3 | standard |
| C-75 | HQ writes the Log line before the change is checked and saved. | 1 | S3 | full |

## M17 Dates, time and the calendar (worst S2, 49 findings)

**Cause:** Dates show without the year or day; India date rules are copied; date maths assume an easy calendar.

**Guard that closes it:** One date helper for India; tests run at fixed times, across midnight and month ends.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| D-20 | Jobs and lists work only on a fixed recent window, so items older than it, including ones missed during an outage, quietly vanish. | 6 | S2 | full |
| A-36 | Dates and ages of readings are shown as day-and-month, time-only or raw day counts with no year or day, and a page's open line never refreshes. | 7 | S3 | light |
| C-42 | Dates and times use whatever clock is to hand (device clock, UTC, a 05:30 reset), because there is no shared India-day and server-time helper. | 5 | S3 | full |
| A-57 | Date maths assumes an easy calendar: month-end starts lose days, festival lists end silently, and kept answers use the save day. | 3 | S3 | standard |
| D-83 | The India-day and date rules are written out by hand in many places, some on the device or world clock. | 15 | S4 | full |
| D-84 | Tests wait on real time or read today's date, so they fail on slow machines or around midnight, or skip silently. | 11 | S4 | full |
| C-95 | Calendar day cells read their raw date ('2026-11-03') to screen readers, because each calendar builds its own label instead of one spoken-date helper. | 2 | S4 | full |

## M21 Owner operations and keys (worst S2, 41 findings)

**Cause:** Accounts and keys have one owner; HQ hand-work has no queue; outside assets have no rights record.

**Guard that closes it:** A second owner on every account; one HQ queue; a rights register for pictures and media.

**Owner notes:** O-27

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| C-11 | Work that MettleUp must do by hand (credit top-ups, complaints, refunds, page reports, lock-outs, delete requests) arrives through general boxes with no queue, kind or tool in HQ. | 7 | S2 | full |
| C-18 | The service rests on one person's accounts, domains and single-copy keys with no written way back, so losing one account or key breaks the service. | 16 | S3 | full |
| A-31 | Outside icons, pictures, sounds, code packages and Hevy pages are used without a register of where they came from and what their licence asks, so credits and notices are missing. | 8 | S3 | light |
| A-49 | Logos, page photos, product photos and profile text go out to members with no rights or consent line and no report or hide step. | 4 | S3 | light |
| D-85 | Old ForgeAI assets and generic icons are still shipped, because no check lists the brand assets in use. | 6 | S4 | full |

## M03 Personal data leaving the system (worst S2, 17 findings)

**Cause:** Names, ID numbers or gym details go to the AI, to downloads, to logs or to shared links with no filter.

**Guard that closes it:** One filter sits on every way out (AI, export, log, share link); tests prove nothing personal passes it.

**Owner notes:** O-28

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| A-21 | Hiding names and numbers before sending to the AI is done separately in each call, so rewrites and some import columns send real details, and public lines claim the AI sees columns only. | 4 | S2 | full |
| B-08 | Personal data (names, ID numbers, typed numbers) is put into outgoing AI requests, download files or browser storage with no shared filter that strips it. | 3 | S2 | full |
| A-37 | Text typed by members, desk staff or outside files (names, batch names, exercise names, help messages) is pasted into AI prompts as trusted facts with no fence, so it can steer the AI. | 6 | S3 | standard |
| C-82 | Outage and key notes are posted in a public place. | 1 | S3 | full |
| D-92 | Raw request text is logged on parse errors, so personal data can land in the server log. | 1 | S4 | full |
| A-72 | Save my history writes typed names into spreadsheet cells as-is, so a name starting with = runs as a formula. | 1 | S4 | light |
| A-71 | Members can share the gym's own workout plans outside the gym with no gym check. | 1 | S4 | light |

## M19 Touch, reading and accessibility (worst S3, 160 findings)

**Cause:** Tap areas are small, text does not grow, meaning is shown only by colour, and forms lose input.

**Guard that closes it:** Shared controls with minimum size, big-font and contrast checks; forms keep input on close.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| D-34 | Each input box parses numbers, phones and text itself, so Hindi digits, 'Rs.', decimal points, +91 and spaces are handled differently or wrongly. | 18 | S3 | full |
| C-17 | Small controls and tappable rows are drawn as plain text with no shared tap-row or text-button style, so they do not look tappable. | 17 | S3 | full |
| C-20 | Icon buttons, card buttons, boxes and rows get no spoken name, or one that differs from what is shown, because components do not build the spoken name from their visible words and state. | 14 | S3 | full |
| C-23 | Controls are sized one by one, so many fall under the 44/48-point finger size the apps already set as a rule. | 12 | S3 | full |
| D-47 | Taps and links are pointed at screens by hand, and nothing checks they open the place their words name. | 9 | S3 | full |
| D-48 | Buttons and titles are fixed to one line, and no test renders them at big font on a narrow phone. | 9 | S3 | full |
| C-31 | Results, errors and new answers appear without being read out (or are read out again every minute), because there is no shared announce line. | 8 | S3 | full |
| C-33 | Form errors, limits and reasons are shown in a top banner, a placeholder, a stale warning or not at all, instead of at the field, because forms have no shared field-error pattern. | 7 | S3 | full |
| C-35 | Closing a sheet, panel or form, or a rewrite, throws away what was typed or spoken, because sheets have no shared keep-the-draft or ask-before-closing rule. | 7 | S3 | full |
| C-38 | Charts, calendars, picked swatches, best sets and chat senders carry meaning only by colour, bar height, hover or touch, with no words or shape. | 6 | S3 | full |
| C-41 | Sheets, panels and page changes do not move or hold keyboard focus, because each opens and closes itself without a shared focus-trap helper. | 6 | S3 | full |
| C-36 | Hand-made pick-one lists, toggles and folds lack the proper roles, open/closed state and arrow keys, because there is no shared choice component. | 6 | S3 | full |
| C-45 | Custom boxes and buttons wipe or recolour the keyboard focus ring instead of using one shared focus style. | 4 | S3 | full |
| C-47 | Text is sized in fixed pixels or with a fake scaling test, so it ignores the person's bigger text setting. | 4 | S3 | full |
| D-63 | Lists stop at a fixed newest-N with no paging, so counts and older items are cut off. | 4 | S3 | full |
| D-59 | Some ways of adding a member never ask for fields that later features need (birthday, body figure). | 4 | S3 | full |
| C-48 | Colour tokens are picked without a contrast check, so some words and badges are too faint in light or dark look. | 3 | S3 | full |
| C-50 | Number boxes set their own limits, so some silently drop a too-big number and others accept impossible values. | 3 | S3 | standard |
| C-56 | Lists and searches stop at a fixed cap without saying so, because the cap is set per query with no shared 'and N more' pattern. | 3 | S3 | full |
| C-54 | Swapping the before and after photos skips the older-first rule, so the newer photo can be called Before. | 3 | S3 | standard |
| C-65 | Sideways-scrolling rows hide items off the edge with no scroll bar, arrow or wrap. | 2 | S3 | full |
| C-60 | Some records can only be added, never edited or closed (a staff job name, a branch). | 2 | S3 | full |
| A-64 | Dragging an exercise in a live workout can drop it in the wrong place. | 1 | S3 | standard |
| C-84 | The quick-buttons sheet lists rows in a fixed order, ignoring the chosen order. | 1 | S3 | standard |
| D-78 | Branding previews only the dark look. | 1 | S3 | standard |
| C-91 | Whole surfaces and screens (HQ, the phone app, the assistant, signed-out and newer panel pages) are left out of the automatic accessibility check. | 5 | S4 | full |
| C-99 | The coach mic works only while held, which a screen reader cannot do. | 1 | S4 | standard |

## M18 Internal notes, maps and dead code (worst S3, 97 findings)

**Cause:** Internal notes and the feature map are typed by hand; retired features leave dead code.

**Guard that closes it:** Notes and the map are built from the code; dead code is removed with a plan.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| D-27 | There is no dead-code check, so unused and switched-off code, some kept alive only by its own tests, piles up. | 25 | S3 | full |
| D-33 | The feature map and set-up notes are hand-kept, not read from live state, so they say things are off or waiting that are live. | 18 | S3 | full |
| A-27 | Backlog, feature list and planning notes are kept by hand and never re-derived from code and switches, so they say things are live, built, switched off or private when they are not. | 17 | S3 | standard |
| D-36 | Small rules and helpers are copied by hand into several files and have drifted apart. | 16 | S3 | full |
| C-29 | The list of live features and the 'not live' notes are kept by hand, so removed, hidden or now-live features are still listed wrongly and their help and leftover code linger. | 8 | S3 | full |
| A-46 | When a feature is switched off, retired or renamed, its code paths, buttons and stored names stay behind with no gate. | 5 | S3 | standard |
| A-55 | Things decided or called worth building (teen accounts, QR location check, class booking) sit in the backlog with no owner, date or parked decision. | 3 | S3 | light |
| C-59 | A workout's name is worked out separately on each screen and copy (History, trainer, Health Connect, gym plan), so renames do not travel. | 3 | S3 | full |
| C-68 | Old paths (the ForgeAI app, the Drive restore) are retired by date without a plan for the people still on them. | 2 | S3 | full |

## M20 Shared rules copied per feature (worst S3, 50 findings)

**Cause:** Gym locks, gym settings and member preferences are read separately by each feature.

**Guard that closes it:** One reader for gym settings, locks and preferences; every feature uses it.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| D-31 | Gym pause, unpaid lock, Pro and Plus locks and page-off are checked screen by screen, so new screens and server paths miss them. | 22 | S3 | full |
| D-32 | Member choices (units, hidden exercises, machine steps, goals, snoozes, sharing) are read separately by each feature, so newer features miss them. | 19 | S3 | standard |
| D-44 | Owner settings (AI limits, trial, offers, language, message calm, alerts, defaults) are read separately by each feature or hard-coded, so some features ignore them. | 9 | S3 | full |

## M23 iPhone port (worst S3, 7 findings)

**Cause:** The iPhone build carries Android assumptions and misses the invite path.

**Guard that closes it:** An iPhone check list run on every iPhone change.

| Sub | Cause | Size | Worst | Lane |
|---|---|---|---|---|
| A-39 | The iPhone app is built on Android-only assumptions (update path, payment, Apple sign-in, notifications, iCloud backup, permission reasons) with no iPhone launch checklist. | 6 | S3 | full |
| D-91 | Invite links have no iPhone path that keeps the gym. | 1 | S4 | light |

## M25 Owner feature requests (worst -, 0 findings)

**Cause:** New features and ideas from the owner's notes (not audit defects).

**Guard that closes it:** Each one goes through the No Gaps design gate before any build.

**Owner notes:** O-03, O-04, O-06, O-19, O-21, O-23, O-29, O-30, O-31, O-32, O-33, O-35, O-37


Closed owner notes: O-07 built (row redesign is O-36); O-13 done (0.80.0); O-34 not MettleUp.
