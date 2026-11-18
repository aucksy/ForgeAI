# T1b: source lists by script (step A1b)

Made by `node docs/system-map/_tools/sources.mjs` (plain Node, no dependencies, a few seconds). Re-run it to refresh every file below.

## Files written

- docs/system-map/_sources/panel.txt: 453 lines
- docs/system-map/_sources/phone.txt: 573 lines
- docs/system-map/_sources/watch.txt: 55 lines
- docs/system-map/_sources/server.txt: 1266 lines
- docs/system-map/_sources/hq.txt: 135 lines
- docs/system-map/_sources/words.txt: 148 lines
- docs/system-map/_sources/readers-raw.txt: 537 calls (312 different tables/functions)
- docs/system-map/_sources/sizes.csv
- docs/system-map/_sources/areas.json: 37 areas

## Counts per kind

### panel.txt (453)

- folder: 24
- from-call: 7
- local-key: 8
- menu-item: 29
- overlay: 41
- redirect: 2
- route: 47
- route-title: 22
- rpc-call: 12
- rpc-name: 177
- screen-component: 42
- screen-file: 36
- tab-type: 6

### phone.txt (573)

- channel: 6
- channel-native: 10
- deeplink-custom: 24
- deeplink-manifest: 7
- deeplink-scheme: 1
- deeplink-web: 4
- from-call: 2
- layout-file: 2
- manifest-activity: 3
- manifest-receiver: 5
- manifest-service: 1
- native-component: 8
- native-prefs: 50
- overlay: 26
- rpc-call: 4
- rpc-name: 70
- screen-component: 57
- screen-file: 103
- secure-write: 6
- special-file: 2
- storage-key-const: 96
- storage-read: 21
- storage-remove: 30
- storage-store: 9
- storage-write: 21
- task: 5

### watch.txt (55)

- activity: 2
- channel: 4
- composable-screen: 15
- permission: 9
- prefs: 10
- receiver: 6
- service: 4
- wear-message-path: 5

### server.txt (1266)

- cron-db-none: 1
- cron-github: 1
- cron-worker: 5
- cron-worker-none: 1
- d1-sql: 180
- d1-table: 18
- db-function: 572
- db-table: 105
- db-trigger: 92
- host: 9
- host-commented-out: 1
- route: 183
- route-pattern: 13
- rpc-call: 3
- rpc-name: 82

### hq.txt (135)

- api-call: 48
- heading: 43
- menu-link: 9
- page-part: 1
- route: 11
- screen: 10
- section: 13

### words.txt (148)

- email-link-built-here: 3
- message-builder: 26
- phone-native-notification: 4
- phone-notification: 9
- push-builder: 5
- push-fcm-send: 2
- template-broadcast: 16
- template-whatsapp-personal: 4
- watch-notification: 4
- whatsapp-cloud-send: 2
- whatsapp-cloud-template: 2
- whatsapp-link-built-here: 10
- whatsnew-panel: 20
- whatsnew-phone: 41

### readers-raw.txt

- d1 / SQL text: 180
- rpc / .rpc( call: 16
- rpc / REST address: 3
- rpc / name passed to a wrapper: 329
- storage / .from( call: 4
- table / .from( call: 5
- database functions defined: 572; tables: 105; D1 tables: 18

## Areas proposed for A2

| area | surface | files | lines | source-list lines |
|---|---|---|---|---|
| web/pages | web | 33 | 9556 | 55 |
| panel/screens-1 | panel | 14 | 9139 | 39 |
| panel/screens-2 | panel | 22 | 9167 | 54 |
| panel/forms | panel | 6 | 1647 | 7 |
| panel/ui-shell | panel | 52 | 11728 | 19 |
| panel/logic-1 | panel | 43 | 10928 | 1 |
| panel/logic-2 | panel | 56 | 10982 | 46 |
| panel/shop | panel | 47 | 8869 | 110 |
| panel/assistant | panel | 25 | 6837 | 11 |
| panel/auth-data | panel | 23 | 8459 | 45 |
| panel/pay-machines | panel | 33 | 7084 | 67 |
| panel/brand-shell | panel | 42 | 8507 | 120 |
| phone/screens-1 | phone | 34 | 7231 | 59 |
| phone/screens-2 | phone | 73 | 7566 | 102 |
| phone/shop-1 | phone | 50 | 9373 | 35 |
| phone/shop-2 | phone | 68 | 9398 | 135 |
| phone/tracker-services-1 | phone | 63 | 10762 | 20 |
| phone/tracker-services-2 | phone | 58 | 10868 | 22 |
| phone/tracker-components-1 | phone | 52 | 8226 | 11 |
| phone/tracker-components-2 | phone | 49 | 8215 | 11 |
| phone/tracker-engine | phone | 35 | 10011 | 0 |
| phone/tracker-data | phone | 39 | 9326 | 10 |
| phone/tracker-lib | phone | 59 | 9117 | 2 |
| phone/native | phone | 38 | 11102 | 81 |
| phone/components-1 | phone | 67 | 7312 | 3 |
| phone/components-2 | phone | 60 | 7178 | 2 |
| phone/cloud-backup-ai | phone | 46 | 9259 | 19 |
| phone/onboarding-db | phone | 68 | 11893 | 25 |
| phone/lib-core | phone | 70 | 7594 | 75 |
| watch/app | watch | 25 | 5958 | 39 |
| hq/app | hq | 8 | 2841 | 135 |
| server/panel-worker | server | 40 | 8014 | 272 |
| server/hq-gate-workers | server | 18 | 4483 | 169 |
| server/database-1 | server | 33 | 7918 | 225 |
| server/database-2 | server | 29 | 7930 | 293 |
| server/database-3 | server | 36 | 8114 | 252 |
| server/ci-workflows | server | 20 | 3524 | 2 |

Files in no area: 0

## Spot check (10 random lines per list, opened at file:line by the script)

### panel.txt: 10/10 sit where the list says

```
OK   screen-component | AllBranchesScreen | apps/dashboard/src/crm/branches/AllBranches.tsx:32  =>  export function AllBranchesScreen() {
OK   screen-file | Receipt.tsx | apps/dashboard/src/crm/ui/screens/Receipt.tsx:1  =>  /**
OK   rpc-name | owner_save_alert_settings | apps/dashboard/src/crm/shop/webPushApi.ts:60  =>  const r = await guarded(async () => alertSettingsFrom(await call<unknown>('owner_save_aler
OK   rpc-name | owner_hq_end | apps/dashboard/src/crm/auth/hqAccess.ts:175  =>  await call<null>('owner_hq_end', { p_key: key });
OK   route | /receipts | apps/dashboard/src/crm/CrmApp.tsx:415  =>  case 'receipts':
OK   route | /settings/branding | apps/dashboard/src/crm/CrmApp.tsx:472  =>  if (id === 'branding') return <BrandingScreen />;
OK   folder | apps/dashboard/src/crm/auth | apps/dashboard/src/crm/auth:0  =>  (folder or file exists)
OK   rpc-name | owner_web_push_on | apps/dashboard/src/crm/shop/webPushApi.ts:106  =>  const r = await call<{ ok?: boolean; on?: boolean }>('owner_web_push_on', { p_key: key, p_
OK   overlay | VoidPaymentSheet | apps/dashboard/src/crm/ui/forms/VoidPaymentSheet.tsx:24  =>  export function VoidPaymentSheet({
OK   rpc-name | owner_add_branch | apps/dashboard/src/crm/branches/api.ts:32  =>  const r = await call<Row>('owner_add_branch', { p_key: key, p_name: name.trim(), p_copy_pl
```

### phone.txt: 10/10 sit where the list says

```
OK   screen-file | /shop/diet | apps/mobile/src/app/shop/diet.tsx:1  =>  // R-120: the diet plan the gym's trainer sent (Gym tab → Diet plan).
OK   storage-remove | forgeai-gym-join-try [JOIN_TRY_STORAGE_KEY] | apps/mobile/src/shop/gymActions.ts:136  =>  await AsyncStorage.removeItem(JOIN_TRY_STORAGE_KEY);
OK   screen-file | /settings/save-backup | apps/mobile/src/app/settings/save-backup.tsx:1  =>  /** Settings → Backup and restore → "Download my data" (R-123; renamed R-320): one file wi
OK   screen-component | NewExerciseScreen | apps/mobile/src/app/library/new.tsx:98  =>  export default function NewExerciseScreen() {
OK   channel-native | open (value unknown: built in code) | apps/mobile/modules/forge-rest/android/src/main/java/com/forgeai/rest/RestCard.kt:1243  =>  NotificationChannel(open, "Rest is over, app open: $label", NotificationManager.IMPORTANCE
OK   storage-remove | forgeai-membership [MEMBERSHIP_STORAGE_KEY] | apps/mobile/src/shop/gymActions.ts:531  =>  AsyncStorage.removeItem(MEMBERSHIP_STORAGE_KEY).catch((e: unknown) => console.warn('[Forge
OK   storage-key-const | cloud_copy_last_at [LAST_COPY_KEY] | apps/mobile/src/cloud/accountMeta.ts:14  =>  export const LAST_COPY_KEY = 'cloud_copy_last_at';
OK   storage-read | forgeai-gym-diets [GYM_DIETS_KEY] | apps/mobile/src/tracker/services/gymBodySync.ts:88  =>  const c = parseGymDietsCopy(await AsyncStorage.getItem(GYM_DIETS_KEY));
OK   rpc-name | member_questions | apps/mobile/src/shop/gymApi.ts:574  =>  const r = await call('member_questions', { p_key: key }, READ_MS);
OK   native-prefs | forgeai_rest_quiet [PREFS_QUIET] | apps/mobile/modules/forge-rest/android/src/main/java/com/forgeai/rest/RestCard.kt:336  =>  ctx.getSharedPreferences(PREFS_QUIET, Context.MODE_PRIVATE).edit().putBoolean("quiet", qui
```

### watch.txt: 10/10 sit where the list says

```
OK   composable-screen | RestScreen | apps/mobile/android/wear/src/main/java/com/forgeai/wear/LogScreens.kt:555  =>  private fun RestScreen(
OK   receiver | .BootReceiver (manifest) | apps/mobile/android/wear/src/main/AndroidManifest.xml:128  =>  <receiver
OK   service | WorkoutService : Service | apps/mobile/android/wear/src/main/java/com/forgeai/wear/WorkoutService.kt:32  =>  class WorkoutService : Service() {
OK   channel | rest-live [CH_LIVE] | apps/mobile/android/wear/src/main/java/com/forgeai/wear/RestAlerts.kt:56  =>  NotificationChannel(CH_LIVE, "Rest countdown", NotificationManager.IMPORTANCE_LOW).apply {
OK   permission | android.permission.VIBRATE | apps/mobile/android/wear/src/main/AndroidManifest.xml:10  =>  <uses-permission android:name="android.permission.VIBRATE" />
OK   receiver | RestAlarmReceiver : BroadcastReceiver | apps/mobile/android/wear/src/main/java/com/forgeai/wear/RestAlarmReceiver.kt:8  =>  class RestAlarmReceiver : BroadcastReceiver() {
OK   prefs | forgeai_watch_open [PREFS] | apps/mobile/android/wear/src/main/java/com/forgeai/wear/WorkoutStarted.kt:68  =>  val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
OK   composable-screen | PermissionScreen | apps/mobile/android/wear/src/main/java/com/forgeai/wear/WatchScreens.kt:760  =>  internal fun PermissionScreen(
OK   composable-screen | EffortScreen | apps/mobile/android/wear/src/main/java/com/forgeai/wear/LogScreens.kt:498  =>  private fun EffortScreen(
OK   channel | rest-over [CH_OVER] | apps/mobile/android/wear/src/main/java/com/forgeai/wear/RestAlerts.kt:67  =>  NotificationChannel(CH_OVER, "Rest is over", NotificationManager.IMPORTANCE_HIGH).apply {
```

### server.txt: 10/10 sit where the list says

```
OK   d1-sql | ai_usage | deploy/hq/web.js:271  =>  .prepare("SELECT gym_id, provider, SUM(calls) AS calls, SUM(failed) AS failed, SUM(tokens_
OK   db-function | apply_gym_payment (defined 3x, newest shown) | supabase/migrations/0063_gym_checkout.sql:294  =>  create or replace function public.apply_gym_payment(p_gym uuid, p_plan text, p_billing tex
OK   db-function | member_trainer_share3 (defined 1x, newest shown) | supabase/migrations/0084_progress_year.sql:61  =>  create or replace function public.member_trainer_share3(p_key text, p_summary jsonb, p_rec
OK   db-function | _ai_month_spent (defined 2x, newest shown) | supabase/migrations/0078_ai_questions.sql:120  =>  create or replace function public._ai_month_spent(p_gym uuid, p_month text) returns int
OK   route | /api/push/web-key | deploy/panel/worker.js:158  =>  if (url.pathname === '/api/push/web-key') return handleWebKey(request, env);
OK   db-table | gym_page_chats | supabase/migrations/0094_page_chat.sql:56  =>  create table if not exists public.gym_page_chats (
OK   db-function | _ai_add_free (defined 1x, newest shown) | supabase/migrations/0071_ai_assistant.sql:160  =>  create or replace function public._ai_add_free(p_gym uuid) returns void
OK   host | mettleup.in (panel Worker) | deploy/panel/wrangler.jsonc:31  =>  { "pattern": "mettleup.in", "custom_domain": true },
OK   db-function | owner_remove_member_photo (defined 1x, newest shown) | supabase/migrations/0043_member_photos.sql:107  =>  create or replace function public.owner_remove_member_photo(p_key text, p_member text)
OK   rpc-name | gym_page_report_send | deploy/panel/gymPageServe.js:249  =>  fn: 'gym_page_report_send',
```

### hq.txt: 10/10 sit where the list says

```
OK   api-call | /api/pay-details | apps/hq/public/app.js:1225  =>  d = await api('/api/pay-details');
OK   heading | h2: Which app version members use | apps/hq/public/app.js:735  =>  h('div', { class: 'card' }, h('h2', {}, 'Which app version members use'),
OK   menu-link | #log | apps/hq/public/index.html:63  =>  <a href="#log"><svg class="ic" aria-hidden="true"><use href="#i-log"/></svg><span>Log</spa
OK   section | paymentCard | apps/hq/public/app.js:1198  =>  function paymentCard(p, status) {
OK   heading | h1: Payments | apps/hq/public/app.js:1140  =>  h('h1', {}, 'Payments'),
OK   api-call | /api/leads/status | apps/hq/public/app.js:983  =>  await api('/api/leads/status', { id: r.id, status: st.value, note: nt.value });
OK   api-call | /api/access/end | apps/hq/public/app.js:683  =>  action('Close access now', async () => { await api('/api/access/end', { gymId: id }); awai
OK   section | planCard | apps/hq/public/app.js:404  =>  function planCard(g, id, ready) {
OK   menu-link | #gyms | apps/hq/public/index.html:54  =>  <a class="in-tabs" href="#gyms"><svg class="ic" aria-hidden="true"><use href="#i-gyms"/></
OK   screen | needsPage | apps/hq/public/app.js:938  =>  async function needsPage(withLoading = true) {
```

### words.txt: 10/10 sit where the list says

```
OK   message-builder | receiptMessage | apps/dashboard/src/crm/logic/whatsapp.ts:272  =>  export function receiptMessage(
OK   template-broadcast | student | apps/dashboard/src/crm/logic/messageTemplates.ts:313  =>  id: 'student',
OK   whatsnew-phone | 0.55.0 | apps/mobile/src/lib/whatsNew.ts:497  =>  version: '0.55.0',
OK   whatsnew-panel | 2026-10-25 | apps/dashboard/src/crm/logic/whatsNew.ts:547  =>  id: '2026-10-25',
OK   message-builder | mapsLinkOk | deploy/panel/gymPage.js:94  =>  export function mapsLinkOk(url) {
OK   template-broadcast | closed-today | apps/dashboard/src/crm/logic/messageTemplates.ts:154  =>  id: 'closed-today',
OK   whatsnew-panel | 2026-11-07 | apps/dashboard/src/crm/logic/whatsNew.ts:376  =>  id: '2026-11-07',
OK   whatsnew-phone | 0.58.0 | apps/mobile/src/lib/whatsNew.ts:390  =>  version: '0.58.0',
OK   phone-notification | scheduleRestEnd | apps/mobile/src/tracker/services/workoutAlerts.ts:194  =>  await n.scheduleNotificationAsync({
OK   phone-notification | same | apps/mobile/src/shop/gymReminders.ts:294  =>  await n.scheduleNotificationAsync({
```

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
