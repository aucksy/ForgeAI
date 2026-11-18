# Checkpoint: A2-phone-cloud-backup-ai

Output: docs/system-map/_work/out/A2-phone-cloud-backup-ai.jsonl (25 rows, F-phone-1500 to F-phone-1534)

## Finished units
- [x] 1. Source list read (59 lines).
- [x] 2. Code opened: top comment of all 46 files in the four folders, the export list of each, and the exact lines for outbox.ts 20-83, copyApi.ts 14-120, session.ts 40-178, orchestrator.ts 105-199.
- [x] 3. Switches and plan gates noted (below).
- [x] 4. Items grouped into features.
- [x] 5. Unit ai (11 files) written: F-phone-1500 to 1505.
- [x] 5. Unit backup (10 files + phone.txt#392, #393) written: F-phone-1510 to 1513.
- [x] 5. Unit cloud (19 files + 17 phone.txt lines) written: F-phone-1520 to 1534.
- [x] 6. Not-a-feature rows: 1504 (grounding.ts), 1513 (backupCoverage.ts), 1533 (member_copy_count), 1534 (app_limits).
- [x] Coverage check run: all 59 source ids are in at least one row; all entry paths and lines exist.

## Switches and gates met
- FEATURES.coach = false (apps/mobile/src/lib/features.ts:6): the whole coach (chat, keys, tools, meal photo).
- FEATURES.gymSync = false (same line): the old email + gym code link, the member_summary push, "delete my cloud data". Settings shows CloudCard only when PARTS has 'gymSync' (apps/mobile/src/app/settings/gym.tsx:45).
- FEATURES.nutrition = false (same line): not followed into the coach's meal tools (could not check in this step's budget).
- MEMBER_PLAN_GATE_ON = false (packages/theme/src/memberPlan.ts:28): MettleUp Plus limits (own exercises over 7, charts older than 3 months).
- isAccountBuild() (apps/mobile/src/cloud/config.ts:41): MettleUp account needs server config + a real Google client id; app.json:143 carries a real-looking id, so treated as live.
- isDriveConfigured() (apps/mobile/src/cloud/drive.ts:67): Drive restore.
- accountOffered() (apps/mobile/src/cloud/accountGate.ts:27) returns only `configured`: every member is offered the account.

## Seen in passing (not findings yet, one line each)
- apiAppLimits (copyApi.ts:117) and apiCopyCount (copyApi.ts:99) have no caller anywhere in apps/mobile/src: dead server calls (app_limits, member_copy_count).
- backupStore.backupNow (uploads a new backup to Drive) has no screen calling it, but the upload and pruning code is still in drive.ts:283-410; BackupCard.tsx:192 carries a TODO to remove the Drive code about Feb 2027.
- session.ts:167: reauthenticate() signs out with the default (global) scope when the wrong account is used, while signOutCloud at session.ts:136 deliberately uses scope 'local' so other phones stay signed in. Behind gymSync (off), so no member meets it today.
- outbox.ts:76-82: a failed push is marked 'error' and is retried on every later drain with no limit and no wait (query is status <> 'synced'). Behind gymSync (off).
- copyApi.ts:25 logs the server's error message text to the console; header says no key or token is logged, not verified here.
- groq.ts header: default Groq models cannot read pictures, so a meal photo with a Groq key is sent to a model that cannot see it; how that reads to the member was not checked.

## Could not check
- Whether each coach tool is also hidden by FEATURES.nutrition (tools.ts is 1,387 lines; only the tool names were read).
- Items of the same folders that have no line in my source list as a "file" (accountMeta.ts, backupSettings.ts, copyApi.ts, copyLocal.ts, outbox.ts, session.ts): covered only through their phone.txt lines.
