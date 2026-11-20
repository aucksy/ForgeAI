// Scratch generator for A5-server-hq-gate-workers-3 rows. Writes _work/out/A5-server-hq-gate-workers-3.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'out', 'A5-server-hq-gate-workers-3.jsonl');
const rows = [];
const counters = {};
const slug = (r) => r.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function J(feature, role, type, start, steps, writes = [], reads = [], promise_ids = [], tests = [], coverage = 'unknown') {
  counters[feature] = (counters[feature] || 0) + 1;
  const nn = String(counters[feature]).padStart(2, '0');
  const id = `J-${feature}-${nn}`;
  rows.push({ kind: 'journey', id, feature, role, type, generated: false, start,
    steps: steps.map(([action, user_sees, must_not], i) => ({ n: i + 1, action, user_sees, must_not })),
    writes, reads, promise_ids, tests, coverage, last_result: null });
  return id;
}
function T(feature, role, type, applies, why_not, variants = [], at_step = 0, entity = 'none', note = 'none') {
  rows.push({ kind: 'jtype', id: `JT-${feature}-${slug(role)}-${type}`, feature, role, type, applies,
    why_not: applies === 'yes' ? 'none' : why_not, variants: applies === 'yes' ? variants : [],
    at_step: applies === 'yes' ? at_step : 0, entity: applies === 'yes' ? entity : 'none', note });
}

// ================= F-server-222 AI credits (HQ admin)
{
  const F = 'F-server-222', R = 'HQ admin';
  J(F, R, 1, "HQ, one gym's page, card 'AI Assistant credits'; the gym paid Rs 399 by UPI for a 150 pack", [
    ["Type 150 in 'Credits', pick 'A pack the gym paid for' in 'What it is', write 'paid Rs 399 by UPI on 12 Nov' in 'Note'", ["Help line 'Packs: 50 (₹149), 150 (₹399), 500 (₹999). A minus number takes free credits back.'", "Note help 'Written in the log.'"], ["Credits added before the button is tapped"]],
    ["Tap 'Add AI credits'", ["Question 'Add 150 AI credits to <gym name>?'"], ["Credits added when the question is cancelled"]],
    ["Confirm", ["The gym page reloads with 'Saved: <gym name> now has <n> AI credits.'", "A new line at the top of the recent credits list"], ["A balance that did not go up by exactly 150", "The add missing from 'What HQ did here' and the HQ log"]],
  ], ['E-gym-ai-credit-ledger', 'E-hq-audit'], ['E-gym-ai-credit-ledger'], ['P-A7-legal-2-82']);
  J(F, R, 2, "HQ, one gym's page, 'AI Assistant credits'; free credits were given by mistake", [
    ["Pick 'Free credits from MettleUp', type -50 in 'Credits', write a note", ["The fields keep the values"], ["The kind switching back to 'A pack the gym paid for' by itself"]],
    ["Tap 'Add AI credits'", ["Question 'Take back 50 AI credits from <gym name>?'"], ["The question saying 'Add' for a minus number"]],
    ["Confirm", ["'Saved: <gym name> now has <n> AI credits.' with the balance 50 lower, never below 0"], ["A balance below 0", "Credits the gym paid for taken back"]],
  ], ['E-gym-ai-credit-ledger', 'E-hq-audit'], ['E-gym-ai-credit-ledger'], ['P-A7-legal-2-82']);
  J(F, R, 3, "HQ, one gym's page, 'AI Assistant credits'", [
    ["Tap 'Add AI credits' with 'Credits' empty, 0, 2.5 or 5001", ["The question, then the words for a bad request under the button (BAD_REQUEST)"], ["Any credits added", "A success line"]],
    ["Pick 'A pack the gym paid for' and type -10, then confirm", ["The words for a bad request: a paid pack cannot be minus"], ["Paid credits taken back"]],
    ["Open the page on a database without the AI credits update (0071)", ["The card shows the not-ready words (AI_NOT_READY) and no add form"], ["An add form that fails on every tap"]],
  ], [], ['E-gym-ai-credit-ledger']);
  J(F, R, 6, "HQ, a gym that never used the AI Assistant", [
    ["Open the gym page", ["'No credits added or used yet. The owner gets 20 starter credits the first time they open the AI Assistant, and 100 free every month while on a paid yearly or lifetime plan.'"], ["A blank card or NaN balance"]],
    ["Add a 50 pack, then take back 10 free credits", ["Balance and the recent list show both lines, newest first, at most 10 lines"], ["The first line lost when the second is added"]],
  ], ['E-gym-ai-credit-ledger', 'E-hq-audit'], ['E-gym-ai-credit-ledger']);
  J(F, R, 12, "HQ, a gym page, after adding credits with a note", [
    ["Read 'What HQ did here' and the credits list", ["The add with its note, seen only inside HQ"], ["The note shown to another gym"]],
    ["The owner opens the AI Assistant in the admin app", ["The new balance"], ["Bought credits later taken back or expired, against the credits promise"]],
  ], ['E-gym-ai-credit-ledger'], ['E-hq-audit'], ['P-A7-legal-2-81', 'P-A7-legal-2-82']);
  T(F, R, 4, 'yes', '', ['T4-long'], 1, 'E-gym-ai-credit-ledger', 'The page caps the note at 300 letters, the server at 500');
  T(F, R, 5, 'yes', '', ['T5-month1'], 3, 'E-gym-ai-credit-ledger', 'Free credits given on the last day of a month: do they end with that month (free credits end on the last day)');
  T(F, R, 7, 'yes', '', ['T7-doubletap', 'T7-offline'], 3, 'E-gym-ai-credit-ledger', 'The button runs once at a time; an answer lost after the save may lead to a second add on retry');
  T(F, R, 8, 'no', 'HQ has no language, theme, unit or alert setting that changes adding credits');
  T(F, R, 9, 'yes', '', ['T9-390', 'T9-laptop'], 1, 'none', 'Card with three fields and a long help line');
  T(F, R, 10, 'yes', '', ['T10-olddata'], 1, 'E-gym-ai-credit-ledger', 'Before update 0071 the card shows the not-ready words');
  T(F, R, 11, 'yes', '', ['T11-apppanel'], 3, 'E-gym-ai-credit-ledger', "The owner's AI Assistant balance must match HQ's");
}

// ================= F-server-224 daily AI limits (HQ admin)
{
  const F = 'F-server-224', R = 'HQ admin';
  J(F, R, 1, "HQ, one gym's page, 'AI Assistant credits' card, part 'Daily limit' showing 'Normal limit.'", [
    ["Type 100 in 'AI requests a day' and 20 in 'Spoken minutes a day'", ["Help 'Normal: 50 (20 while the gym is in its free trial or has not paid). 0 switches the AI Assistant off for this gym.'", "Help 'Normal: 10.'"], ["The boxes reset while typing"]],
    ["Tap 'Save the limit'", ["'Saved: 100 AI requests and 20 spoken minutes a day.'"], ["A success line when the save failed", "The change missing from HQ's log"]],
    ["Reload the gym page", ["'Set by MettleUp for this gym.' with 100 and 20 in the boxes"], ["The old numbers back after reload"]],
  ], ['E-assist-limits', 'E-hq-audit'], ['E-assist-limits']);
  J(F, R, 2, "HQ, one gym's page, card 'AI column matching'", [
    ["Type 50 in 'Reads a day for this gym' (help 'Normal: <n>. 0 switches it off for this gym.') and tap 'Save the limit'", ["'Saved: 50 a day.'"], ["The AI Assistant limit changed by this card"]],
    ["Tap 'Back to normal'", ["'Back to normal: <n> a day.' and the box shows the normal number"], ["The gym left on 50 after 'Back to normal'"]],
  ], ['E-ai-limits', 'E-hq-audit'], ['E-ai-limits', 'E-ai-usage']);
  J(F, R, 3, "HQ, one gym's page, 'Daily limit'", [
    ["Type 501 requests, 121 minutes, -1 or 2.5 and tap 'Save the limit'", ["The words for a bad request under the buttons"], ["Any limit saved"]],
    ["Clear 'AI requests a day' (empty box) and tap 'Save the limit'", ["The limit stays as it was, or a clear word that the box is empty"], ["The AI Assistant switched off for the gym because an empty box was sent as 0"]],
    ["Open the page where the web database update (0015) is missing", ["'The AI Assistant daily limit can be set once its web database update (0015) is applied.'"], ["Boxes that fail on every save"]],
  ], [], ['E-assist-limits']);
  J(F, R, 6, "HQ, a gym on its own limit", [
    ["Type 0 in 'AI requests a day', 'Save the limit'", ["'Saved: 0 AI requests and <m> spoken minutes a day.'"], ["The owner's AI Assistant still answering after the limit is 0"]],
    ["Tap 'Back to normal'", ["'Saved: 50 AI requests and 10 spoken minutes a day.' and 'Normal limit.' after reload"], ["'Set by MettleUp for this gym.' still shown after going back to normal"]],
  ], ['E-assist-limits', 'E-hq-audit'], ['E-assist-limits', 'E-ai-usage']);
  T(F, R, 4, 'yes', '', ['T4-zero'], 1, 'E-assist-limits', 'No row for the gym = normal limit; the page must say Normal limit');
  T(F, R, 5, 'yes', '', ['T5-midnight'], 2, 'E-ai-usage', 'The day count resets on the India day; a limit saved at 23:59 must apply to the right day');
  T(F, R, 7, 'yes', '', ['T7-doubletap', 'T7-twostaff'], 2, 'E-assist-limits', 'Two HQ tabs saving different limits: last save wins with no word');
  T(F, R, 8, 'no', 'HQ has no language, theme, unit or alert setting that changes the limits');
  T(F, R, 9, 'yes', '', ['T9-390'], 1, 'none', 'Two number boxes and two buttons in a row');
  T(F, R, 10, 'yes', '', ['T10-olddata'], 1, 'E-assist-limits', 'Before panel D1 0015 the part shows the not-ready line');
  T(F, R, 11, 'yes', '', ['T11-apppanel'], 2, 'E-assist-limits', "The owner's AI Assistant must follow the new limit");
  T(F, R, 12, 'no', 'A gym-level number with no personal data; no promise in promises.json speaks of HQ daily limits');
}

// ================= F-server-217 support access (HQ admin, gym owner)
const J217 = {};
{
  const F = 'F-server-217';
  let R = 'HQ admin';
  J217.hq1 = J(F, R, 1, "HQ, one gym's page, 'Support access' card says 'Closed. Normally the gym opens it ...'; HQ signed in less than 15 minutes ago", [
    ["Pick a 'Reason', write one sentence in 'What happened', pick '30 minutes' in 'For how long', tap 'Open in an emergency'", ["Question 'Open support access in an emergency? It is read-only, it ends by itself, and the gym owner sees it with your reason.'"], ["Access opened when the question is cancelled"]],
    ["Confirm", ["Card 'Support access is open': 'Opened by MettleUp (emergency), until <time>. Read-only. The gym owner sees every look.'"], ["Access opened for more than 60 minutes", "The opening missing from the gym owner's list"]],
    ["Tap one record button (for example payments)", ["A table titled '<kind> (<n>)' or 'None.'"], ["Any way to change a record", "Records of another gym"]],
    ["Tap 'Close access now'", ["The card is back to 'Support access' closed"], ["Records still readable after closing"]],
  ], ['E-hq-grants', 'E-hq-audit'], ['E-crm-records', 'E-hq-grants'], ['P-A7-legal-2-13', 'P-A7-legal-2-46']);
  J(F, R, 2, "HQ, one gym's page, the gym owner opened access from the admin app", [
    ["Open the gym page", ["'Opened by the gym, until <time>. Read-only. The gym owner sees every look.'"], ["The emergency form shown while the gym's own access is open"]],
    ["In 'Sign-in history' tap 'Show sign-in history'", ["'Support access is open, so names, devices and addresses show (the gym owner sees this look).' and rows with Who, Device, From"], ["Names, devices or addresses shown while access is closed"]],
  ], ['E-hq-audit'], ['E-gym-access-log', 'E-hq-grants']);
  J(F, R, 3, "HQ, one gym's page, support access closed; HQ signed in more than 15 minutes ago", [
    ["Fill the form and tap 'Open in an emergency', confirm", ["The fresh sign-in words and a 'Sign in again' button"], ["Access opened without a fresh sign-in"]],
    ["Tap 'Sign in again'", ["Google sign-in, then back on the same gym page"], ["Landing on the home page and losing the gym"]],
    ["Open with an empty 'What happened'", ["The server's refusal words"], ["Access opened with no reason the owner can read"]],
  ], [], ['E-hq-grants']);
  J(F, R, 6, "HQ, a gym page with access open for 15 minutes", [
    ["Wait past the end time and reload", ["The closed 'Support access' card"], ["Record buttons still working after the end time"]],
    ["Open it again in an emergency", ["A new open card with the new end time"], ["The old window counted as still open", "The second opening missing from the owner's list"]],
  ], ['E-hq-grants', 'E-hq-audit'], ['E-hq-grants']);
  J217.hq12 = J(F, R, 12, "HQ, a gym page, access closed, the owner did not ask", [
    ["Open access in an emergency and read members", ["Member names and phone numbers in the table"], ["A look the gym owner cannot see with its reason", "A member list read while the in-app promise says support looks only when the gym lets them"]],
  ], ['E-hq-grants', 'E-hq-audit'], ['E-crm-records'], ['P-A7-panel-3-02', 'P-A7-panel-3-04', 'P-A7-pilot-12', 'P-A7-legal-2-46']);
  T(F, R, 4, 'yes', '', ['T4-many'], 3, 'E-crm-records', "The page asks only the first page (shows '200+') and has no next-page button");
  T(F, R, 5, 'yes', '', ['T5-zone'], 2, 'E-hq-grants', "Open or closed is judged by the HQ device's clock; 'until <time>' must say India time");
  T(F, R, 7, 'yes', '', ['T7-closed', 'T7-doubletap'], 2, 'E-hq-grants', 'Closing the tab leaves access open until it ends by itself');
  T(F, R, 8, 'no', 'HQ has no language, theme, unit or alert setting that changes support access');
  T(F, R, 9, 'yes', '', ['T9-390'], 3, 'none', 'Record tables on a phone use the stacked table');
  T(F, R, 10, 'yes', '', ['T10-olddata'], 1, 'E-hq-grants', 'Before update 0028 the database has no support access');
  T(F, R, 11, 'yes', '', ['T11-apppanel'], 3, 'E-hq-audit', "Each look must show on the owner's 'MettleUp access' card");

  R = 'gym owner';
  const test = [{ path: 'apps/dashboard/e2e/forgeaccess.spec.mjs', checks: "Opens Help and feedback, taps 'Let MettleUp support look (1 hour)', confirms 'Yes, for 1 hour', sees the open line, taps 'Close it now', sees the closed line; against a mocked server" }];
  J(F, R, 1, "Admin app, Help and feedback, card 'MettleUp access' saying 'MettleUp has never opened your records.'", [
    ["Tap 'Let MettleUp support look (1 hour)'", ["Sheet 'Let MettleUp support look?' with 'They cannot change anything.'"], ["Access opened before 'Yes, for 1 hour'"]],
    ["Tap 'Yes, for 1 hour'", ["'Support access is open until <time> (you opened it). Nothing looked at yet.'"], ["Access open for longer than one hour"]],
    ["HQ looks at payments", ["The look listed on the card"], ["A look not listed"]],
  ], ['E-hq-grants'], ['E-hq-audit'], ['P-A7-panel-3-02'], test, 'partial');
  J(F, R, 2, "Admin app, Settings", [
    ["Tap the link 'Help and feedback → MettleUp access'", ["Help and feedback opens with the 'MettleUp access' card"], ["A blank page or the card missing"]],
  ], [], ['E-hq-audit', 'E-hq-grants'], [], test, 'partial');
  J(F, R, 3, "Admin app signed in as front desk, or a gym not set up online", [
    ["Open Help and feedback", ["No support button for the desk (the server refuses anyone but the owner), or 'MettleUp access is not switched on for your gym yet.'"], ["A desk login opening support access"]],
  ], [], ['E-hq-grants']);
  J(F, R, 6, "Admin app, 'MettleUp access' with access open (you opened it)", [
    ["Tap 'Close it now'", ["'Support access was open <day>, <from>-<to> (you opened it). Nothing was looked at.' and the button 'Let MettleUp support look (1 hour)' again"], ["HQ still able to read records after closing"]],
  ], ['E-hq-grants'], ['E-hq-audit'], [], test, 'partial');
  J217.own12 = J(F, R, 12, "Admin app, 'MettleUp access', the owner never opened access", [
    ["HQ opens access in an emergency and reads members", ["A line that MettleUp opened access in an emergency, with the reason and what was looked at"], ["Records read with no line on the card", "Any other gym or member seeing this list"]],
  ], [], ['E-hq-audit', 'E-hq-grants'], ['P-A7-panel-3-02', 'P-A7-panel-3-04', 'P-A7-pilot-12']);
  T(F, R, 4, 'yes', '', ['T4-zero'], 1, 'E-hq-audit', "'MettleUp has never opened your records.'");
  T(F, R, 5, 'yes', '', ['T5-midnight'], 2, 'E-hq-grants', 'A window opened at 23:30 ends at 00:30: the closed line must show the right days');
  T(F, R, 7, 'yes', '', ['T7-doubletap', 'T7-offline'], 2, 'E-hq-grants', "Two windows from a double tap on 'Yes, for 1 hour'");
  T(F, R, 8, 'yes', '', ['T8-language'], 1, 'none', 'The card words in Hinglish');
  T(F, R, 9, 'yes', '', ['T9-360'], 2, 'none', 'The sheet must fit a phone (the test checks this)');
  T(F, R, 10, 'yes', '', ['T10-olddata'], 1, 'E-hq-grants', "Before 0028: 'MettleUp access is not switched on for your gym yet.'");
  T(F, R, 11, 'yes', '', ['T11-twopanels'], 2, 'E-hq-grants', 'Opened on the phone, the laptop must show it open after a refresh');
}

// ================= F-server-227 nightly backup (the system, HQ admin)
{
  const F = 'F-server-227';
  let R = 'the system';
  J(F, R, 1, 'The 03:00 India-time Cron Trigger fires; KV binding BACKUP is set', [
    ['The backup runs first: one call to the gym server for one copy of all gym data', ["Log '[backup] stored' with the day, size and parts"], ['The clean-up running before the copy']],
    ['The copy is stored in parts under the India day, the meta last, each with a 7-day expiry', ["KV status { ok: true, lastGoodDay: <today> }"], ['A copy kept longer than 7 days', 'The meta written before every part is stored']],
    ['The nightly clean-up and the billing check run after it', ['Both run even when the backup failed'], ['The clean-up skipped because the backup failed']],
  ], [], ['E-gyms', 'E-crm-records', 'E-gym-members'], ['P-A7-legal-2-47', 'P-A7-legal-2-37']);
  J(F, R, 2, 'A night when the copy is bigger than one KV value (over 20 MB)', [
    ['The copy is cut into 20 MB parts without being read', ["KV keys snap/<day>/part/0, part/1 ... and meta with parts: <n>"], ['A part over the 25 MiB KV limit', 'Parts out of order']],
  ], [], ['E-crm-records']);
  J(F, R, 3, 'A night with something wrong', [
    ['No BACKUP binding', ["Log '[backup] off: no BACKUP binding ...' and nothing stored"], ['A crash that stops the clean-up']],
    ['The gym server lacks update 0052, or does not answer', ["KV status { ok: false, error: 'NOT_READY: migration 0052 not applied' } or 'gym server answered <code>'"], ['The last good time lost']],
    ['The copy does not end in a closing brace (cut short)', ["KV status error 'copy looks incomplete (<n> bytes)'"], ['A cut-off copy stored as good']],
  ], [], ['E-crm-records']);
  J(F, R, 6, 'Several nights in a row', [
    ['A night fails after a good night', ['Status ok false, lastGoodAt still the good night'], ['lastGoodAt wiped by the failed night']],
    ['Eight nights pass', ['Copies older than 7 days are gone by themselves'], ['An eighth copy still kept']],
  ], [], ['E-crm-records']);
  J(F, R, 12, 'A member deleted their account yesterday', [
    ["Last night's copy still holds the member", ['The copy expires within 7 days of being taken, so within 7 days of the deletion'], ['A copy with the member kept past 7 days', 'The copy readable by anyone without the Cloudflare account']],
  ], [], ['E-gym-members', 'E-crm-records'], ['P-A7-legal-2-37', 'P-A7-pilot-41']);
  T(F, R, 4, 'yes', '', ['T4-many'], 2, 'E-crm-records', 'A big gym list must still fit the free plan CPU and 1,000 writes a day');
  T(F, R, 5, 'yes', '', ['T5-midnight'], 2, 'E-crm-records', 'Keys use the India day of the run (03:00 IST = 21:30 UTC the day before)');
  T(F, R, 7, 'yes', '', ['T7-closed'], 2, 'E-crm-records', 'A run stopped mid-way leaves parts with no meta: an unfinished copy, status may still say the old run');
  T(F, R, 8, 'no', 'The job has no setting besides the BACKUP binding, covered by the negative journey');
  T(F, R, 9, 'no', 'A night job with no screen');
  T(F, R, 10, 'yes', '', ['T10-olddata'], 2, 'E-crm-records', "A copy in format 'mettleup-backup-1' must restore after later database updates");
  T(F, R, 11, 'no', 'One job on Cloudflare; no second device takes part');

  R = 'HQ admin';
  J(F, R, 1, "The watch workflow (or the owner) asks /backup/status the morning after a good night", [
    ['GET /backup/status with no sign-in', ["Answer { setUp: true, lastRunOk: true, lastGoodAt: <time>, fresh: true }"], ['Any gym name, size or count in the answer']],
  ], [], ['E-crm-records']);
  J(F, R, 3, 'The status asked in a wrong way or before set-up', [
    ['GET /backup/status with no BACKUP binding', ["{ setUp: false, fresh: false }"], ["fresh true when nothing is stored"]],
    ['POST /backup/status', ['Not answered as status: HQ sign-in is asked'], ['The status changed by a public call']],
  ], [], ['E-crm-records']);
  J(F, R, 6, 'Just deployed, no night yet, then nights go by', [
    ['Ask the status the first time', ['fresh true, and the waiting time is remembered'], ['An alarm on the day of the deploy']],
    ['No good copy for more than 30 hours', ['fresh false; the watch opens an issue'], ['fresh true after 30 hours with no good copy']],
  ], [], ['E-crm-records']);
  T(F, R, 2, 'no', 'The answer is read only at /backup/status; the restore script is outside this feature\'s entry points');
  T(F, R, 4, 'no', 'The answer has a fixed shape of four fields; no list or text');
  T(F, R, 5, 'no', 'fresh is counted in hours since the last good copy, not by calendar day');
  T(F, R, 7, 'no', 'One read with no steps to interrupt');
  T(F, R, 8, 'no', 'No setting changes the status answer');
  T(F, R, 9, 'no', 'A JSON answer read by the watch, no screen');
  T(F, R, 10, 'yes', '', ['T10-olddata'], 1, 'unknown', 'A status saved by an older Worker version without lastGoodAt');
  T(F, R, 11, 'no', 'Read by the watch workflow only; no second device');
  T(F, R, 12, 'no', 'The answer carries no gym data: only set up, ok, fresh and a time');
}

// ================= F-server-231 fee request note (the system, staff, member)
{
  const F = 'F-server-231';
  let R = 'the system';
  J(F, R, 1, 'Every minute; the desk made a fee request two minutes ago for a member who has the app', [
    ["Read open 'fee' requests of the last 15 minutes (at most 100) from the Cloudflare database", ['The request is in the list'], ['Requests of shop orders or paid requests handed as fee notes']],
    ['Hand id, gym, list id and plan label to the gym server', ["One note per app member: 'Your gym asked you to pay for <plan>. Tap to pay in the app.'"], ['A name, phone number or amount leaving the Cloudflare database']],
    ['The phone pop-ups run in the same minute', ['The note goes out'], ['The note sent twice']],
  ], ['E-member-push-notes'], ['E-crm-records']);
  J(F, R, 3, 'Bad rows or a server not ready', [
    ['A row with a bad id, a non-uuid gym or no list id', ['That row skipped, the rest handed'], ['The whole run failing for one bad row']],
    ['The gym server lacks update 0073', ["One warning 'the gym server has no hq_fee_request_notes yet'"], ['A warning every minute', 'The phone pop-ups after it skipped']],
  ], ['E-member-push-notes'], []);
  J(F, R, 6, 'The same request on the next runs', [
    ['The next minute reads the same open request', ['No new note (the server tag makes one note per request)'], ['A second pop-up for the same request']],
    ['The desk marks it paid before the next run', ['No note'], ['A please-pay note after the fee was paid']],
  ], ['E-member-push-notes'], ['E-member-push-notes']);
  J(F, R, 12, 'A fee request for a member', [
    ['The note is written', ["Only the plan label, never the amount; 'Your gym asked you to pay your fee. Tap to pay in the app.' when there is no label"], ['An amount or another member\'s name in the note', 'The note going to an app member of another gym']],
  ], ['E-member-push-notes'], []);
  T(F, R, 2, 'no', "Only kind 'fee' requests become member notes; online payments and shop requests go another way");
  T(F, R, 4, 'yes', '', ['T4-many'], 1, 'E-member-push-notes', 'More than 100 open fee requests in 15 minutes across all gyms: later ones wait or are missed');
  T(F, R, 5, 'no', 'The window is 15 minutes of real time; nothing is dated by calendar day');
  T(F, R, 7, 'yes', '', ['T7-closed'], 2, 'E-member-push-notes', "A restarted Worker forgets what it handed; the server's tag must stop a double note");
  T(F, R, 8, 'no', "The job has no setting; the member's notification setting is in the member's line");
  T(F, R, 9, 'no', 'A minute job with no screen');
  T(F, R, 10, 'yes', '', ['T10-olddata'], 2, 'E-member-push-notes', 'Before update 0073 the feed is skipped');
  T(F, R, 11, 'no', 'One job on Cloudflare; no second device takes part');

  R = 'staff';
  J(F, R, 1, "Admin app, a member with dues who has the MettleUp app", [
    ["Send the desk's 'please pay' fee request for the member's plan", ['The request shows as open on the desk'], ['The request made for the wrong member']],
    ['Wait a minute', ['The member gets the pop-up on the phone'], ['The member never told, with the desk unaware']],
  ], [], ['E-member-push-notes']);
  J(F, R, 3, 'Admin app, a member on the list who never joined the app', [
    ["Send the 'please pay' fee request", ['The request is made; no phone note can go'], ['The desk told the member was notified when no app phone is linked']],
  ], [], ['E-crm-records']);
  J(F, R, 6, 'Admin app, an open fee request', [
    ['Mark it paid or cancel it before the next minute', ['No note goes'], ['A please-pay pop-up after the money was taken']],
    ['Cancel it after the note went', ['The note already sent stays on the phone'], ['A second note for the same request']],
  ], [], ['E-member-push-notes']);
  T(F, R, 2, 'no', 'The desk makes a fee request in one place only, the pay sheet of the admin app');
  T(F, R, 4, 'yes', '', ['T4-long', 'T4-hinglish'], 1, 'E-member-push-notes', 'The plan label is cut to 60 letters in the note');
  T(F, R, 5, 'no', 'The note goes within a minute and carries no date');
  T(F, R, 7, 'yes', '', ['T7-doubletap'], 1, 'E-member-push-notes', 'Two requests for the same due give two notes');
  T(F, R, 8, 'no', 'No desk setting changes whether the note goes');
  T(F, R, 9, 'no', "The desk's screen is the pay sheet, another feature");
  T(F, R, 10, 'no', 'The request is handed by its stored row; the desk app version does not change the note');
  T(F, R, 11, 'yes', '', ['T11-apppanel'], 2, 'E-member-push-notes', 'The member sees the same plan the desk asked for');
  T(F, R, 12, 'no', "The desk sees nothing new; what the member's note shows is in the system's privacy journey");

  R = 'member';
  J(F, R, 1, 'Phone with the MettleUp app joined to the gym; the desk asked for the fee', [
    ['The pop-up arrives', ["'Your gym asked you to pay for <plan>. Tap to pay in the app.'"], ['An amount on the lock screen']],
    ['Tap the pop-up', ['The pay screen of the app opens'], ['The app opening on the home screen with no way to pay']],
  ], [], ['E-member-push-notes']);
  J(F, R, 3, 'A member whose list entry is not linked to the app, or who left the gym', [
    ['The desk asks for the fee', ['No pop-up'], ['A pop-up from a gym the member left']],
  ], [], ['E-member-push-notes']);
  J(F, R, 6, 'The member paid after the pop-up', [
    ['Open the app the next minute', ['No new pop-up for the same request'], ['The same request popping up again']],
  ], [], ['E-member-push-notes']);
  J(F, R, 12, 'The phone is locked on a table', [
    ['The pop-up shows on the lock screen', ['Only the gym asking and the plan name'], ['The amount owed shown to anyone holding the phone']],
  ], [], ['E-member-push-notes']);
  T(F, R, 2, 'no', 'The note is reached only from the pop-up; the pay screen belongs to the shop feature');
  T(F, R, 4, 'yes', '', ['T4-hinglish'], 1, 'E-member-push-notes', 'A plan label in Devanagari in the pop-up');
  T(F, R, 5, 'no', 'The pop-up carries no date');
  T(F, R, 7, 'yes', '', ['T7-offline'], 1, 'E-member-push-notes', 'Phone offline: the pop-up comes once when back');
  T(F, R, 8, 'yes', '', ['T8-permission'], 1, 'E-member-push-notes', 'Notifications refused: no pop-up and no other sign');
  T(F, R, 9, 'yes', '', ['T9-bigfont'], 1, 'none', 'Long plan label in the pop-up');
  T(F, R, 10, 'yes', '', ['T10-olddata'], 2, 'E-member-push-notes', "An older app version that does not know the 'fee_request' note");
  T(F, R, 11, 'yes', '', ['T11-watch'], 1, 'E-member-push-notes', 'The pop-up mirrored on a watch');
}

// ================= F-server-201 install HQ (HQ admin)
{
  const F = 'F-server-201', R = 'HQ admin';
  J(F, R, 1, 'Phone browser, HQ open and signed in', [
    ['Add HQ to the home screen', ['The HQ name and icon from the manifest, fetched without sign-in'], ['A broken icon', 'A private page cached for anyone']],
    ['Open HQ from the home screen', ['HQ opens; sign-in asked if needed'], ['Gym data shown without sign-in']],
  ], [], []);
  J(F, R, 2, 'HQ installed on the phone, no internet', [
    ['Open HQ from the home screen', ["The 'You're offline' page"], ['A browser error page', 'Old gym data shown offline']],
  ], [], []);
  J(F, R, 3, 'A browser that is not signed in', [
    ['Open /api/gyms or any HQ page other than the install files', ["{ error: 'SIGN_IN' } for the API, or the move to sign-in"], ['Any gym data']],
    ['Ask /icons/other.png or POST to /manifest.webmanifest', ['Not served as a public file'], ['A prefix of a public path serving a private file']],
  ], [], []);
  J(F, R, 6, 'HQ installed; a new version is deployed', [
    ['Open HQ again', ['The new service worker is checked on every visit (no-cache)'], ['An old service worker stuck for days']],
  ], [], []);
  T(F, R, 4, 'no', 'A fixed set of eight install files with no data');
  T(F, R, 5, 'no', 'No time edge: only cache times of an hour or a day');
  T(F, R, 7, 'yes', '', ['T7-offline'], 2, 'none', "Losing the internet mid-use must show 'You're offline'");
  T(F, R, 8, 'no', 'HQ has no setting that changes the install files');
  T(F, R, 9, 'yes', '', ['T9-360', 'T9-tablet'], 2, 'none', 'Offline page and icon on small and big screens');
  T(F, R, 10, 'yes', '', ['T10-midway'], 2, 'none', 'An old service worker after a deploy');
  T(F, R, 11, 'no', 'Installed per device; nothing is shared between devices');
  T(F, R, 12, 'no', 'The public files carry no gym or member data (only icons, manifest, service worker and offline page)');
}

// ================= F-server-200 sign in (HQ admin)
{
  const F = 'F-server-200', R = 'HQ admin';
  J(F, R, 1, 'HQ in Google mode, not signed in, asking a gym page', [
    ['Open HQ', ['The Google account picker'], ['HQ pages before sign-in']],
    ['Pick the allowed Google account', ['Back on the page asked for, signed in'], ['Landing on another site', 'The sign-in not written in HQ\'s log']],
  ], ['E-hq-audit'], []);
  J(F, R, 2, 'HQ in Cloudflare Access mode', [
    ['Open HQ and pass Cloudflare Access with the allowed account', ['HQ opens'], ['HQ opening for another account']],
    ['Sign out', ["Cloudflare Access's sign-out page"], ['A HQ session left active']],
  ], [], []);
  J(F, R, 3, 'HQ in Google mode', [
    ['Sign in with a Google account that is not allowed', ["'Could not sign you in' with 'This Google account cannot open MettleUp HQ.' and 'Try again'"], ['Any HQ page for that account']],
    ['Sign in while the gym server is down', ["'Could not sign you in' with 'The gym server did not answer, so the sign-in could not be written down. Try again in a minute.'"], ['A sign-in with no record in HQ\'s log']],
    ['A setting of HQ is missing', ["'MettleUp HQ is not set up yet' with 'A setting is missing. Ask Claude to check the HQ setup list.'"], ['A half-working HQ']],
  ], [], ['E-hq-audit']);
  J(F, R, 6, 'Signed in to HQ', [
    ['Sign out', ["'Signed out' with 'You are signed out of MettleUp HQ.' and 'Sign in again'"], ['HQ pages still open on this browser']],
    ['Open a support access action 20 minutes after sign-in', ["The fresh sign-in words and 'Sign in again'"], ['Support access opened with a sign-in older than 15 minutes']],
    ['Come back after 30 days', ['Sign-in asked again'], ['A session older than 30 days still working']],
  ], [], ['E-hq-audit']);
  J(F, R, 12, 'HQ sign-in log', [
    ['Sign in, then sign out', ["The sign-in is in HQ's log with whether it was fresh"], ['Another person able to open HQ with a link from the history']],
  ], ['E-hq-audit'], []);
  T(F, R, 4, 'no', 'One allowed account list and no text input');
  T(F, R, 5, 'no', 'Times are seconds since sign-in, not calendar days');
  T(F, R, 7, 'yes', '', ['T7-back', 'T7-closed'], 2, 'E-hq-audit', 'Back on the Google page or a closed tab mid sign-in: the 10-minute sign-in cookie must not leave a half sign-in');
  T(F, R, 8, 'no', 'HQ has no setting that changes sign-in');
  T(F, R, 9, 'yes', '', ['T9-390'], 2, 'none', 'Sign-in error pages on a phone');
  T(F, R, 10, 'yes', '', ['T10-olddata'], 2, 'unknown', 'A session cookie made by an older version or secret');
  T(F, R, 11, 'yes', '', ['T11-twopanels'], 2, 'none', 'Signing out on the laptop does not sign out the phone');
}

// ================= F-server-228 nightly clean-up (the system)
{
  const F = 'F-server-228', R = 'the system';
  J(F, R, 1, 'The 03:00 India-time Cron Trigger fires, after the backup', [
    ['Remove, in the Cloudflare database, feedback older than 1 year, leads older than 1 year without a deal, AI use counts older than 1 year', ['Counts of rows removed'], ['A lead with a deal deleted', 'Feedback younger than 1 year deleted']],
    ['The gym server clean-up runs and logs both', ["Log '[hq-cron] clean-up done'"], ['The clean-up before the backup']],
    ["Delete the tests' own 'QA ...' gyms older than a day, then AI Assistant requests older than 400 days", ["Logs 'test gyms deleted' and 'old AI requests deleted'"], ['A real gym deleted', 'An AI request younger than 400 days deleted']],
  ], ['E-feedback', 'E-leads', 'E-ai-usage', 'E-gym-ai-tasks', 'E-hq-audit'], ['E-feedback', 'E-leads'], ['P-A7-legal-2-11', 'P-A7-legal-2-12', 'P-A7-websites-1-41']);
  J(F, R, 2, 'The other kind: the AI Assistant purge on its own', [
    ['Delete AI Assistant requests older than 400 days for every gym', ['The request and its words gone; the credits count stays'], ['The credit totals changed']],
  ], ['E-gym-ai-tasks'], ['E-gym-ai-credit-ledger'], ['P-A7-legal-2-11', 'P-A7-legal-2-12']);
  J(F, R, 3, 'A night with something wrong', [
    ['The Cloudflare database step fails', ["web { error: 'failed' } and the gym server clean-up still runs"], ['The whole night stopped by the first step']],
    ['The gym server clean-up fails', ['Error logged; the QA gym and 400-day purges are not reached that night'], ['Silence: no error in the logs']],
    ['Update 0066 or 0071 missing', ["qaGyms or aiOld { error: 'failed' }"], ['The other steps undone']],
  ], [], ['E-feedback']);
  J(F, R, 6, 'Rows at the edges', [
    ["A lead marked 'won' and 2 years old", ['Kept'], ['Deleted']],
    ["A real gym whose name starts with 'QA'", ['Kept (only the tests\' own QA gyms go)'], ['A real gym deleted for its name']],
  ], ['E-leads', 'E-gyms'], ['E-leads', 'E-gyms']);
  J(F, R, 12, 'Privacy promises on keeping data', [
    ['After 400 days an AI request is deleted; leads go within 12 months when no deal', ['Only the credits used stay'], ['A request older than 400 days still kept', 'A lead older than 12 months with no deal still kept']],
  ], ['E-gym-ai-tasks', 'E-leads'], [], ['P-A7-legal-2-11', 'P-A7-legal-2-12', 'P-A7-websites-1-41']);
  T(F, R, 4, 'yes', '', ['T4-many'], 1, 'E-feedback', 'Thousands of old rows in one night against the free plan limits');
  T(F, R, 5, 'yes', '', ['T5-midnight'], 1, 'E-ai-usage', 'The year cut-off is a UTC moment; AI use rows are by India day');
  T(F, R, 7, 'yes', '', ['T7-closed'], 3, 'E-gym-ai-tasks', 'A run stopped mid-way skips the later purges until the next night');
  T(F, R, 8, 'no', 'The clean-up has no setting');
  T(F, R, 9, 'no', 'A night job with no screen');
  T(F, R, 10, 'yes', '', ['T10-olddata'], 3, 'E-gym-ai-tasks', 'Before 0066 or 0071 those purges answer failed');
  T(F, R, 11, 'no', 'One job on Cloudflare; no second device takes part');
}

// ================= findings
rows.push({ kind: 'finding', id: 'FN-A5-server-hq-gate-workers-3-01', date: '2026-11-20', lens: 'A5', surface: 'server', area: 'server/hq-gate-workers',
  refs: [J217.hq12, J217.own12], severity: 'S1',
  title: 'MettleUp can open a gym\'s records without the gym saying yes, while the app promises it never does',
  what: 'HQ has an "Open in an emergency" button that opens read access to a gym\'s members, payments and staff without the gym asking. The gym owner\'s own screen and the pilot agreement say MettleUp support can look only when the gym lets them.',
  expected: 'Either the emergency opening is removed, or every promise says MettleUp may open it in an emergency and the owner is told with the reason.',
  evidence: ['apps/hq/public/app.js:692-697', 'deploy/hq/api.js:649-653', 'apps/dashboard/src/crm/ui/ForgeAccessCard.tsx:27-28'],
  proof: 'code-read', root_cause_key: 'emergency-open-skips-owner-consent', who: 'gym owners and their members',
  how_often: 'every time HQ uses the emergency button', fix_line: 'Make the promise and the emergency button say the same thing',
  fix_size: 'small', needs_him: true, verified: 'pending', status: 'open' });
rows.push({ kind: 'finding', id: 'FN-A5-server-hq-gate-workers-3-02', date: '2026-11-20', lens: 'A5', surface: 'server', area: 'server/hq-gate-workers',
  refs: ['J-F-server-224-03'], severity: 'S3',
  title: 'An empty daily limit box switches the gym\'s AI Assistant off',
  what: 'On a gym\'s HQ page, clearing "AI requests a day" or "Spoken minutes a day" and tapping "Save the limit" sends 0, which switches the AI Assistant off for that gym. The server would treat an empty box as the normal limit, but the page never sends it empty.',
  expected: 'An empty box keeps the normal limit, or the page asks for a number.',
  evidence: ['apps/hq/public/app.js:663', 'deploy/hq/api.js:626-628'],
  proof: 'code-read', root_cause_key: 'blank-limit-box-sends-zero', who: 'gym owners (through an HQ slip)',
  how_often: 'when HQ saves with a box left empty', fix_line: 'Send an empty box as empty, not as 0',
  fix_size: 'small', needs_him: false, verified: 'pending', status: 'open' });

fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const j = rows.filter((r) => r.kind === 'journey').length, t = rows.filter((r) => r.kind === 'jtype').length;
const per = {};
for (const r of rows) if (r.kind !== 'finding') { per[r.feature] = per[r.feature] || [0, 0]; per[r.feature][r.kind === 'journey' ? 0 : 1]++; }
console.log('rows', rows.length, 'journeys', j, 'jtype', t, JSON.stringify(per));
