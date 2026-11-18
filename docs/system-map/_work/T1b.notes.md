## Hand check on top of the script's own

24 more lines (4 per list, picked at random with awk) were opened by hand at their file:line on 18 Nov 2026: all 24 sit where the list says.
One weak kind seen: `message-builder` in words.txt also catches helpers such as `mapsLinkOk` (deploy/panel/gymPage.js:94) because the file builds a wa.me link and the name ends in "Link". Treat that kind as "look here", not as a confirmed message.

## What the script cannot see, and why

- Database calls whose function name is built while the app runs (for example the `gate_` + name calls in apps/dashboard/src/crm/machines/supabaseStore.ts, and `rest/v1/rpc/${fn}` in the Workers). Most calls go through wrappers, so the script lists every quoted text that equals a real database function name (`rpc-name`). A function whose name has no underscore would be skipped by that lookup (none today: all 572 names have one).
- Tables read or written inside database functions (the apps almost never call `.from(` directly: 5 table calls in all). Which function touches which table needs the SQL bodies read in A2.
- The 286 database functions with no caller found in app or Worker code (end of readers-raw.txt): the script cannot tell a trigger or SQL-only helper from dead code.
- Crons set up outside the repo (Supabase dashboard, Cloudflare dashboard). In the repo there is no `cron.schedule(` at all, and the gate Worker has no crons.
- Message wording that lives as plain text inside code or SQL (push titles built in deploy/hq/push.js, notice text made by database functions, WhatsApp wording helpers with unusual names). words.txt lists templates, send points and builder functions by name only; it does not prove the list of messages is complete.
- Email: the script found only `mailto:` links (3). Whether any email is sent by a provider is unknown from this pass.
- Watch: the manifest and Kotlin hold 0 Tiles and 0 Complications (1 Activity, 2 Services, 3 Receivers in the manifest). That is a finding, not a gap, but nothing checks the Play listing.
- 3 native notification channels on the phone whose id is built in code (`over`, `open`, `alarm` in RestCard.kt, made by `soundChannel(...)`): listed with "value unknown".
- Phone data kept in the on-device SQLite database (tables) is not in phone.txt: only AsyncStorage, SecureStore, zustand stores and native SharedPreferences are.
- `deeplink-custom` lines include links that are only named in comments (examples such as forgeai://c/RAMS01). The system-level truth is the `deeplink-manifest` and `deeplink-web` lines.
- Worker route strings on a line with none of the words the script looks for (pathname, path, route, startsWith...). Some `route` lines in server.txt are panel page addresses quoted inside Worker code (assistCatalogue.js), not Worker routes.
- Panel sub-tabs passed as props or built from data: only `type ...Tab = 'a' | 'b'` style tabs are listed (6).
- The public website pages under apps/dashboard/public are counted in sizes.csv and in the web/pages area, but no source list was asked for them, so their sections and forms are not listed.
- Test files, node_modules, build output and vendor folders are skipped on purpose everywhere.

## Not mine

`git status` also shows docs/system-map/_sources/e1_history.py and _work/E1.md as changed. This step did not touch them.
