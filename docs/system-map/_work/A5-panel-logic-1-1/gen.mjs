// Scratch generator for work item A5-panel-logic-1-1. Writes _work/out/A5-panel-logic-1-1.jsonl and the checkpoint.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const MAP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WI = 'A5-panel-logic-1-1';
const rows = [];
const counts = new Map();
const seq = new Map();
const bump = (f, k) => { const c = counts.get(f) ?? { j: 0, t: 0 }; c[k] += 1; counts.set(f, c); };
const S = (action, sees, not) => ({ action, user_sees: [].concat(sees), must_not: [].concat(not) });
function J(feature, role, type, start, steps, writes = [], reads = [], promise_ids = []) {
  const n = (seq.get(feature) ?? 0) + 1; seq.set(feature, n);
  rows.push({ kind: 'journey', id: `J-${feature}-${String(n).padStart(2, '0')}`, feature, role, type, generated: false, start,
    steps: steps.map((s, i) => ({ n: i + 1, ...s })), writes, reads, promise_ids, tests: [], coverage: 'unknown', last_result: null });
  bump(feature, 'j');
}
const slug = (r) => r.toLowerCase().replace(/[^a-z0-9]+/g, '-');
function Y(feature, role, type, variants, at_step, entity, note) {
  rows.push({ kind: 'jtype', id: `JT-${feature}-${slug(role)}-${type}`, feature, role, type, applies: 'yes', why_not: 'none', variants, at_step, entity, note });
  bump(feature, 't');
}
function N(feature, role, type, why_not) {
  rows.push({ kind: 'jtype', id: `JT-${feature}-${slug(role)}-${type}`, feature, role, type, applies: 'no', why_not, variants: [], at_step: 0, entity: 'none', note: 'none' });
  bump(feature, 't');
}

// ================================================================ F-panel-605 Today: Latest from your members
{
  const F = 'F-panel-605';
  const R = ['E-gym-alerts', 'E-gym-talk-threads', 'E-trainer-questions', 'E-gym-plan-requests', 'E-gym-phone-links', 'E-shop-orders', 'E-crm-records'];
  const who = {
    owner: { thing: 'a member complaint', line: "the server's own line about the complaint", page: 'Member messages on Complaints', done: 'reply to it or mark the conversation done' },
    staff: { thing: 'a plan request (renew or pause)', line: "the server's own line about the request", page: "the page named in the alert's route", done: 'approve it or say no' },
    trainer: { thing: 'a workout question from a member', line: "'<first name> asked a workout question. Open Member questions to reply.'", page: 'Member questions', done: 'answer the question' },
  };
  for (const role of ['owner', 'staff', 'trainer']) {
    const w = who[role];
    J(F, role, 1, `Today, signed in as ${role}; ${w.thing} came 10 minutes ago and nobody has handled it`, [
      S('Open Today', ["Card titled 'Latest from your members'", `One line: ${w.line}, then '10 min ago'`, 'An urgent line that still waits is in bold'], ['A conversation already marked done, or a request already decided, is listed', 'A line older than 24 hours is listed', 'More than 5 lines']),
      S('Tap the line', [`The panel opens ${w.page}`], ['Another page opens', 'The line counts as done only because it was opened']),
      S(`In that page ${w.done}, then go back to Today`, ['The line is gone from the card', "When no line is left the whole card is gone (no heading)", "The bell still keeps the line, marked 'Done'"], ['The handled line still sits on Today', 'A line that still needs someone is hidden by a guess', 'The bell loses the line']),
    ], ['E-gym-alerts'], R, ['P-A7-whats-new-1-05', 'P-A7-whats-new-1-27']);
    J(F, role, 3, `Today, signed in as ${role}; nothing from members waits (or everything was handled)`, [
      S('Open Today', ["No 'Latest from your members' card at all; the rest of Today as usual"], ["An empty card with only the heading", 'An error or a spinner in its place']),
      S("Open Today while an alert's own list (messages, questions, requests) has not been read since the alert came", ['The line stays on Today until the panel can tell it was handled'], ['The line is hidden although nobody handled it']),
      S('Tap a line whose address the server sent in a form the panel does not accept', ['The panel stays on Today (the safe address)'], ['A blank page', 'An address outside the panel opens']),
    ], [], R, ['P-A7-whats-new-1-05']);
    J(F, role, 6, `Today, signed in as ${role}; one news line (a member joined) and one line that needs someone`, [
      S('Open Today and read the card', ['Both lines are shown; the news line stays while this visit to Today lasts'], ['The news line vanishes while the person is still reading']),
      S('Open another page, then come back to Today', ['The news line is gone (it was shown once)', 'The line that needs someone is still there'], ['The news line shows again on every visit', 'The line that needs someone is gone though nobody handled it']),
      S("Open the bell and take the waiting line off the list with the X, then look at Today", ['The line is still on Today: it is not done'], ['Removing it from the bell takes it off Today']),
      S('Someone else at the gym handles it on another device; wait a minute on Today', ['The line leaves Today without a reload'], ['The line stays until the browser is reloaded', 'The whole page jumps when the list is read again']),
    ], ['E-gym-alerts'], R, ['P-A7-whats-new-1-05', 'P-A7-whats-new-1-01']);
    J(F, role, 2, `The panel is open on any page, signed in as ${role}, browser alerts allowed; a new alert arrives (the ring, not the card)`, [
      S('Sign in and wait for the first answer from the server', ['No ring and no browser notice for alerts that were already there'], ['Opening the panel rings for old alerts']),
      S('One new alert comes while the panel is open', ["A browser notice titled 'MettleUp: news from your members' with the alert's own line"], ['The same alert rings twice', role === 'owner' ? 'The notice opens a page other than the one the line names' : 'A complaint rings on this device']),
      S('Three new alerts come in one look', ["One notice: '3 new updates from your members. Open Today to see them.'"], ['Three separate notices', 'A count that does not match the new lines']),
      S('Tap the notice', ['The panel opens Today (or the page of the single alert)'], ['A second copy of the panel opens on a wrong page']),
    ], [], ['E-gym-alerts'], ['P-A7-whats-new-1-27']);
    if (role === 'owner') {
      J(F, role, 2, 'Today, signed in as owner; another kind of line: a shop order, then an online payment', [
        S('A member orders from the shop; open Today', ["'New shop order #12 from <name>. Get it ready on Shop.' in bold"], ["The order number without '#'", 'A line that disagrees with Shop today']),
        S('On Shop mark the order ready, go back to Today', ['The order line is gone from Today (ready needs nothing more)'], ["'Get it ready' still shown for an order that is ready"]),
        S('A member pays online; open Today', ["The line has its own colour and a small 'Payment' label"], ['A payment line that looks like any other line', 'A failed payment shown in the paid colour']),
      ], ['E-gym-alerts'], ['E-gym-alerts', 'E-shop-orders', 'E-pay-requests'], ['P-A7-whats-new-1-11', 'P-A7-whats-new-1-27']);
      J(F, role, 12, 'Today on the owner device; a member sent a complaint and picked the gym admin', [
        S('Open Today as owner', ['The complaint line is shown, with the first name only as the server wrote it'], ['The complaint text itself on Today', 'A phone number in the line']),
        S('Tap it', ['Member messages opens on Complaints'], ['It opens on Feedback or Questions']),
        S('Sign in on the same browser as front desk and open Today', ['No complaint line, and no ring for it'], ['The desk sees or hears the complaint']),
      ], [], ['E-gym-alerts', 'E-gym-talk-threads'], ['P-A7-help-1-21', 'P-A7-help-1-39']);
    } else if (role === 'staff') {
      J(F, role, 12, 'Today on a front-desk device; a member sent a complaint and another sent feedback', [
        S('Open Today as front desk', ['The feedback line is shown; no complaint line'], ['The complaint is listed', 'The complaint rings on this device']),
        S('Open the bell and its History', ['No complaint there either'], ['The complaint shows in History after the owner handled it']),
      ], [], ['E-gym-alerts', 'E-gym-talk-threads'], ['P-A7-help-1-21', 'P-A7-help-1-39', 'P-A7-phone-watch-2-48']);
    } else {
      J(F, role, 12, 'Today on a trainer device; a member sent feedback and another sent a complaint', [
        S('Open Today as trainer', ['Neither line is shown; only what the server sends a trainer (for example a workout question)'], ['A feedback line on a trainer device', 'A complaint line on a trainer device']),
        S('Wait for a new feedback message to come while the panel is open', ['No ring and no notice for it'], ['The browser notice shows the feedback line']),
      ], [], ['E-gym-alerts', 'E-gym-talk-threads'], ['P-A7-help-1-19', 'P-A7-help-1-38']);
    }
    Y(F, role, 4, ['T4-zero', 'T4-many', 'T4-long'], 1, 'E-gym-alerts', 'Card hides at zero; only 5 newest of the last 24 hours are shown; a long first name must wrap inside a 44 px high tap line');
    Y(F, role, 5, ['T5-midnight', 'T5-zone'], 1, 'E-gym-alerts', "The 24 hour cut and '10 min ago' use this device's clock against the server's alert time; an enquiry counts as called only when its follow-up day is after today");
    Y(F, role, 7, ['T7-offline', 'T7-doubletap', 'T7-twostaff'], 2, 'E-gym-alerts', 'A tap tells the server the line was opened and then moves page; two people handling the same line must both see it leave');
    Y(F, role, 8, ['T8-language', 'T8-theme', 'T8-alerts', 'T8-permission'], 1, 'E-gym-alerts', "The lines are the server's English words; the ring needs the browser's notification permission and follows the alert timing setting");
    Y(F, role, 9, ['T9-360', 'T9-laptop', 'T9-dark', 'T9-bigfont'], 1, 'E-gym-alerts', 'Payment lines carry a coloured background that must stay readable in dark mode');
    Y(F, role, 10, ['T10-olddata', 'T10-midway'], 1, 'E-gym-alerts', "A server without the newer alert list falls back to the browser's own rules; news already shown is kept in this browser and must survive an update");
    Y(F, role, 11, ['T11-twopanels'], 3, 'E-gym-alerts', "News seen on Today is remembered per browser, so a phone and a laptop can differ; done is the server's and must match");
  }
}

// ================================================================ F-panel-604 Notification bell
{
  const F = 'F-panel-604';
  for (const role of ['owner', 'staff', 'trainer']) {
    const noComplaint = role === 'owner' ? 'A line that belongs to another gym or branch' : 'A complaint line on this device';
    J(F, role, 1, `Any page of the panel, signed in as ${role}; three alerts wait, two of them new`, [
      S('Look at the bell at the top', ["A number on the bell; its label reads 'Notifications, 3 waiting for you'"], ['A number that counts handled lines', noComplaint]),
      S('Tap the bell', ["A panel with the group 'Your gym' first, then 'From MettleUp' and 'What's new' when they have something", "The two new lines carry a 'New' tag", "'History' at the top"], ['A group heading with nothing under it (other than Your gym)', 'Lines moving while the panel is open']),
      S('Tap a line that needs someone (a member message)', ['The panel closes and the page of that line opens'], ['The line leaves the bell just because it was opened']),
      S('Handle it in its page and open the bell again', ["The line is no longer in the main list; History shows it with the tag 'Done'", 'The number on the bell is one lower'], ['The line still counted on the bell', 'The line missing from History']),
    ], ['E-gym-alerts'], ['E-gym-alerts', 'E-hq-messages'], ['P-A7-whats-new-1-01', 'P-A7-whats-new-1-11']);
    J(F, role, 3, `Any page, signed in as ${role}; nothing waits and nothing happened in the last 7 days`, [
      S('Tap the bell', ["Under 'Your gym': 'Nothing is waiting for you. New messages and requests from your members will show here.'", "The bell's label is just 'Notifications' (no number)"], ['A blank panel', 'A zero shown as a number on the bell']),
      S("Open 'History'", ["'Nothing here yet. What you finish or remove shows here for 7 days.'"], ['An error', 'Lines older than 7 days']),
      S('The server sends an answer the panel cannot read', ['The bell keeps what it showed before (what exactly: unknown, not read in code)'], ['The panel crashes', 'Every old alert suddenly counts as new']),
    ], [], ['E-gym-alerts'], ['P-A7-whats-new-1-02']);
    J(F, role, 6, `The bell panel is open, signed in as ${role}; one news line and one line that needs someone`, [
      S('Tap the X on the line that needs someone', ["The line leaves the list at once; a bar says 'Removed from your list.' with 'Undo' for about 7 seconds"], ['The thing itself is marked done', 'The line disappears for other people at the gym']),
      S("Tap 'Undo'", ['The line is back in its place by time'], ['Two copies of the line', 'The line comes back as new']),
      S('Tap the X again, wait for the bar to go, open History', ["The line is on top with the tag 'Removed · Not done yet'"], ["The tag says 'Done'", 'The line is missing from History']),
      S('Tap the news line (a member joined)', ["Its page opens; next time the bell opens the line is in History with the tag 'Opened'"], ['News stays in the main list after it was opened', 'The number on the bell still counts it']),
      S('While the panel is open, someone else handles another line on another device', ["That line stays where it was and gets a 'Done' tag in place; nothing new is slipped in until the panel opens again"], ['Lines jump under the finger', 'A handled line with no tag']),
    ], ['E-gym-alerts'], ['E-gym-alerts'], ['P-A7-whats-new-1-01', 'P-A7-whats-new-1-02']);
    J(F, role, 2, `The bell, signed in as ${role}; another way in: History, and another kind: a payment line`, [
      S("Open the bell and tap 'History'", ["'The last 7 days: what was done, opened or removed. Tap a line to open it.' and the lines, newest change first, each with a tag (Done, Opened, Removed, Older than 7 days)"], ['A line with no tag', "An action line removed but not done tagged 'Done'"]),
      S('Tap a History line', ['Its page opens'], ['Nothing happens', 'The line moves back to the main list']),
      S('A member pays online; open the bell', ["The line has the payment colour, a mark and the label 'Payment'"], ["A line that says a payment failed shown as 'Paid'", 'Colour as the only sign (no label)']),
    ], ['E-gym-alerts'], ['E-gym-alerts', 'E-pay-requests'], ['P-A7-whats-new-1-02', 'P-A7-whats-new-1-11']);
    J(F, role, 12, `Two people of one gym, each on their own device; this one is the ${role}`, [
      S('This person removes a line with the X', ['It leaves only this person\'s list'], ["It leaves the other person's bell", 'It is marked done for the gym']),
      S('This person opens the bell (the new lines become read)', ['The number drops only on this person\'s devices'], ["The other person's new lines become read"]),
      S(role === 'owner' ? 'A member sends a complaint; the owner opens the bell' : 'A member sends a complaint; this person opens the bell and History', [role === 'owner' ? 'The complaint line is in the owner\'s bell' : 'No complaint line anywhere in this bell'], [role === 'owner' ? 'The complaint text or a phone number in the line' : (role === 'trainer' ? 'Feedback or a complaint in a trainer bell' : 'A complaint in the front-desk bell')]),
    ], ['E-gym-alerts'], ['E-gym-alerts'], role === 'owner' ? ['P-A7-whats-new-1-02', 'P-A7-help-1-21'] : role === 'staff' ? ['P-A7-whats-new-1-02', 'P-A7-help-1-39'] : ['P-A7-whats-new-1-02', 'P-A7-help-1-19']);
    Y(F, role, 4, ['T4-zero', 'T4-many', 'T4-long'], 2, 'E-gym-alerts', 'Without the newer server list only the newest 8 gym alerts are listed; the number must still be the true count');
    Y(F, role, 5, ['T5-midnight', 'T5-zone'], 2, 'E-gym-alerts', "History keeps 7 days; a browser that never opened the bell counts the last 24 hours as new, by this device's clock");
    Y(F, role, 7, ['T7-offline', 'T7-doubletap', 'T7-twostaff', 'T7-closed'], 3, 'E-gym-alerts', 'Read, opened, remove and undo change the list at once and tell the server after, one after another; a failed save is only written to the console');
    Y(F, role, 8, ['T8-language', 'T8-theme', 'T8-permission'], 2, 'E-gym-alerts', "Headings go through the translator but the alert lines are the server's English; with browser alerts off the bell shows a card to turn them on");
    Y(F, role, 9, ['T9-360', 'T9-laptop', 'T9-dark', 'T9-bigfont'], 2, 'E-gym-alerts', 'The X and the line are two tap targets on one row; payment colours must read in dark mode');
    Y(F, role, 10, ['T10-olddata', 'T10-midway'], 2, 'E-gym-alerts', "The seen time moved from one shared key to one per gym; an old tab and a server without the newer list must both still work");
    Y(F, role, 11, ['T11-twopanels'], 3, 'E-gym-alerts', 'Read, opened and removed are this person\'s on every device; the open panel is frozen, so the other device shows the change first');
  }
}

// ================================================================ F-panel-607 Attendance register and Away list
{
  const F = 'F-panel-607';
  for (const role of ['owner', 'staff']) {
    J(F, role, 1, `Attendance page, signed in as ${role}; the register has been used for some weeks`, [
      S('Open Attendance', ["'Who trained, and when', the box 'Check someone in', the tiles 'Check-ins today' ('So far today') and 'Check-ins a day' ('Average over the last N days')"], ['Money figures on this page', 'Yesterday counted as today']),
      S("Type a name or the last 4 digits of a mobile, tap 'Check in'", ["The button shows 'Saving…', then a message, and the member is on top of today's register", "'Check-ins today' goes up by one"], ['Two check-ins for one tap', 'The check-in saved on another day']),
      S("Tap 'Losing the habit' (the number beside it is the count)", ["'Paying members who are losing the habit'; three counts (Not settled in, Slipping, Gone quiet) and a card per member, most urgent first", "A card reads like '16 days since their last visit. They usually train every 2 days.' with a pill 'Slipping' and 'Usually 6 am–7 am'"], ['A member whose plan has ended, or ends within the renewals window, on this list', 'A reason that talks about money', 'A member who came today or yesterday listed']),
      S("Tap a member's name", ["That member's page opens"], ['Another member opens']),
    ], ['E-crm-records'], ['E-crm-records'], ['P-A7-panel-3-45']);
    J(F, role, 3, `Attendance page, signed in as ${role}`, [
      S('Type a name nobody has', ["'Nobody matches that' and 'Check the spelling, or add them in Members first.'"], ['A blank list with no words', 'A check-in saved for nobody']),
      S("Pick tomorrow in 'Register date'", ["'That day hasn’t happened yet.'; the check-in box is replaced by 'Pick a day first' / 'Pick a day that has already passed. Then the check-in box comes back.'"], ['A check-in saved on a future day']),
      S("Open 'Losing the habit' in a gym that has checked in on fewer than 5 days", ["'Start checking members in' and 'This list needs a few days of check-ins first. Check members in as they arrive, and it fills in by itself. Nobody is listed just because their visits were never added.' with 'Open the register'"], ['Every member listed as gone', "'Everybody is training' shown when the register was never used"]),
      S('The save of a check-in fails', ["The server's words, or 'That didn’t work. Please try again.'"], ['A success message', 'The row left in the register']),
    ], [], ['E-crm-records'], ['P-A7-panel-3-45']);
    J(F, role, 6, `Attendance page, signed in as ${role}; a member was just checked in by mistake`, [
      S("In today's register tap the undo control ('Undo check-in for <name>')", ["A message 'Check-in removed for <name>.'; the row is gone and 'Check-ins today' is one lower"], ['The count stays', 'Another member\'s check-in removed']),
      S('Check the same member in again', ['One row for today'], ['Two rows for one day']),
      S("A member on the 'Losing the habit' list is checked in today; open the list", ['That member has left the list'], ['The member is still listed as away']),
      S('A member on the list gets a plan that ends within the renewals window, or the plan ends', ['The member leaves this list (the renewals list has them)'], ['The same member on both lists with two different asks']),
      S('Every member with a running plan comes as usual', ["'Everybody is training' and 'Every member with a running plan is coming as usual.' with 'Back to the register'"], ['An empty page with no words']),
    ], ['E-crm-records'], ['E-crm-records'], []);
    J(F, role, 2, `Attendance page, signed in as ${role}; the second way in: the figures and the chart of the last weeks`, [
      S('Look at the tiles', ["'Check-ins a day' as the average over the trend days, empty days counted; when it is under one a day the tile says 'Check-ins a week' (or 'Under 1')"], ['An average that leaves closed days out', 'NaN or a figure with many decimals']),
      S("Look at 'When the gym is busy'", ['The 24 hours in order, with the busiest hour named as a span like 6 am–7 am', "With no believable times: 'No timed check-ins yet' / 'Each check-in here saves the time. This fills in as you use the register.'"], ['Imported check-ins with no real time counted in an hour', 'A busiest hour shown when there is none']),
      S('Pick an earlier day in the register date', ["'Check-ins on <day>' / 'On that day' and that day's rows; a row from the member app carries the tag 'App', from a paper import 'Imported', from an entry machine 'Machine'", "A day with none: 'No check-ins on this day.'"], ['Today\'s rows shown under another day', "A member who was deleted hidden instead of shown as 'Unknown member'"]),
    ], [], ['E-crm-records', 'E-entry-machine-punches'], []);
    if (role === 'owner') {
      J(F, role, 2, "Attendance, 'Losing the habit', signed in as owner; another kind of row and the file", [
        S('Look at a member who joined 12 days ago and never came', ["'Joined 12 days ago and hasn’t trained yet.' with the pill 'Not settled in'"], ["'Has never checked in.' for a brand new member of 2 days", 'A pass member (from a pass company) on the list']),
        S("Pick the group 'Gone quiet' in 'Filter by what is happening'", ["Only those cards; an empty group says 'Nobody in this group'"], ['Counts on the chips that do not match the cards']),
        S('Tap the export button', ["A CSV with the columns Member, Mobile, Batch, Status, Last visit, Days since visit, Visits in last 8 weeks, Why; a message 'Exported N members.' ('Exported 1 member.' for one)"], ['Rows in the file that are not on screen', 'A mobile number changed by the spreadsheet (lost zero or exponent form)']),
      ], [], ['E-crm-records'], ['P-A7-panel-3-45']);
    }
    J(F, role, 12, `Attendance, 'Losing the habit', signed in as ${role}`, [
      S('Read the cards', ['Only names, the reason in days, the usual hour and the batch'], ['Fees due, plan price or any money word in a reason', 'A member of another branch']),
      S('Tap the export button', ['A file with the names and mobile numbers of exactly the rows on screen'], ['Archived members in the file', role === 'staff' ? 'Money columns in the file' : 'Members the filter hid']),
    ], [], ['E-crm-records'], ['P-A7-panel-3-45']);
    Y(F, role, 4, ['T4-zero', 'T4-one', 'T4-many', 'T4-long', 'T4-planedge', 'T4-nophoto'], 3, 'E-crm-records', 'Under 5 register days gives the start words; a plan that ends inside the renewals window drops the member; fewer than 4 visits means no own rhythm and the fixed 12 days are used');
    Y(F, role, 5, ['T5-midnight', 'T5-endstoday', 'T5-joinedtoday', 'T5-monday', 'T5-zone'], 2, 'E-crm-records', 'A check-in near midnight must land on the India day; days-since-visit and the 8 week window move at midnight');
    Y(F, role, 7, ['T7-doubletap', 'T7-offline', 'T7-twostaff', 'T7-back'], 2, 'E-crm-records', 'Check in has a busy state per member; two desks checking in one member must leave one row');
    Y(F, role, 8, ['T8-language', 'T8-theme'], 1, 'E-crm-records', 'Reasons and labels are built in English inside the logic file; a Hinglish panel may show them untranslated');
    Y(F, role, 9, ['T9-360', 'T9-laptop', 'T9-dark', 'T9-bigfont'], 3, 'E-crm-records', 'The long reason ran to three lines in a narrow card before; the bar chart and pills need a check');
    Y(F, role, 10, ['T10-olddata'], 3, 'E-crm-records', 'Old check-ins without a believable time and members saved before batches existed must still read');
    Y(F, role, 11, ['T11-twopanels', 'T11-apppanel'], 2, 'E-crm-records', "A member's own QR check-in in the app must show in the register with the tag 'App', and the desk's check-in must show on the other device");
  }
}

// ================================================================ F-panel-608 Messages and offers: who gets it
{
  const F = 'F-panel-608';
  const R = ['E-crm-records', 'E-gym-members'];
  J(F, 'owner', 1, 'Messages & offers, signed in as owner; the gym has members with and without the app', [
    S("Open Messages & offers and go to 'Who gets it'", ["A 'Group' list: Everyone, Plan running today, Plans ending within 7 days, Plans ended in the last 30 days, Stopped coming, Birthdays today, On one plan, In one batch"], ['A group missing', 'Archived members counted in any group']),
    S("Pick 'Plans ending within 7 days'", ["'In the app: N members of this group. Not in the app: N.'", 'A member whose last day is today is in the group'], ['A member who already ended yesterday in this group', 'The two numbers not adding up to the group']),
    S("Look at 'Send on WhatsApp to'", ["Two choices with counts: 'Not in the app' and 'Whole group'"], ["'Not in the app' includes someone who has the app", 'A count that differs from the list sent']),
    S("Tap 'Send in the app' (demo gym only when testing)", ['Only the members of the picked group who have the app get it'], ['Every app member gets a message meant for a small group', 'A member outside the group gets it']),
  ], ['E-gym-messages', 'E-push-jobs'], R, []);
  J(F, 'owner', 3, 'Messages & offers, Who gets it, signed in as owner', [
    S("Pick 'Birthdays today' on a day with no birthday", ['A plain line that nobody is in this group today, and nothing can be sent to nobody'], ['A send button that sends to everyone instead', 'A count of 0 with a working send']),
    S("Pick a group where nobody has the app", ["'Nobody in this group has the MettleUp app yet. Send it on WhatsApp.'"], ["'In the app: 0 members' with an app send still offered"]),
    S("Pick 'On one plan' in a gym with no plans on sale", ["The group falls back to 'Everyone' (for a ready message) or the Plan list is empty and the group has nobody"], ['A crash', 'Personal-training packs offered as plans']),
    S("Pick 'In one batch' and no batch", ['Nobody in the group until a batch is picked'], ['Everyone treated as in the batch']),
  ], [], R, []);
  J(F, 'owner', 6, 'Messages & offers, Who gets it, signed in as owner', [
    S("Pick 'Plans ended in the last 30 days', note the count, then renew one of those members and come back", ['The count is one lower; the member is now in Plan running today'], ['The renewed member still gets the ended-plan message']),
    S("Pick 'Stopped coming', check one of them in on Attendance, come back", ['That member has left the group'], ['A member who came today still gets the message']),
    S("Switch from 'In one batch' to 'Everyone' and back", ["'Everyone (N)' counts every person once: list members plus app members not on the list", 'The batch picked before is still picked or is asked again'], ['A person counted twice in Everyone', 'The old group still used for the send']),
  ], [], R, []);
  J(F, 'owner', 2, "Messages & offers, signed in as owner; other kinds: 'On one plan' and 'In one batch'", [
    S("Pick 'On one plan'", ["A 'Plan' list of the gym plans on sale in the sell order; a ready message starts on the one-month plan"], ['A plan no longer sold listed', 'A member whose plan of that kind has ended counted']),
    S("Pick 'In one batch'", ["A 'Batch' list of the batches that members who are not archived carry"], ['The same batch twice in two spellings', 'A batch only archived members carry']),
    S("Pick 'Stopped coming'", ['The same people as the Losing the habit list on Attendance'], ['A different count from Attendance on the same day']),
  ], [], R, []);
  J(F, 'owner', 12, 'Messages & offers, Who gets it, signed in as owner', [
    S('Pick a small group and read the counts', ['Counts only; the member app is matched by the 10 digits of the mobile number'], ['A member matched to another person through a badly typed number', 'An app member of another gym counted']),
    S('Send in the app to the small group (demo gym only when testing)', ['Only that group reads it in the app'], ['The message visible to every member of the gym', 'Members without the app counted as reached']),
  ], ['E-gym-messages'], R, []);
  Y(F, 'owner', 4, ['T4-zero', 'T4-one', 'T4-many', 'T4-planedge', 'T4-long'], 2, 'E-crm-records', 'A member with no mobile number or a foreign number can never match the app; ending-in-7 counts the last day itself');
  Y(F, 'owner', 5, ['T5-midnight', 'T5-endstoday', 'T5-month1', 'T5-zone'], 2, 'E-crm-records', 'Every group but Everyone and batch depends on today; a message scheduled for later is sent to the group as it was picked, unknown whether it is worked out again');
  Y(F, 'owner', 7, ['T7-doubletap', 'T7-offline', 'T7-back'], 4, 'E-gym-messages', 'A double tap on send must not send twice');
  Y(F, 'owner', 8, ['T8-language', 'T8-theme'], 1, 'E-crm-records', 'Group names are fixed English words in the logic file');
  Y(F, 'owner', 9, ['T9-360', 'T9-laptop', 'T9-dark'], 2, 'E-crm-records', 'The longest group name must fit the Group list on a phone');
  Y(F, 'owner', 10, ['T10-olddata'], 1, 'E-crm-records', 'Members saved before batches existed have no batch and must never fall into a batch group');
  Y(F, 'owner', 11, ['T11-apppanel', 'T11-twopanels'], 4, 'E-gym-messages', 'A member in the group must see the message in the app and a member outside must not');
  // staff: the page is the owner's
  J(F, 'staff', 1, 'Any page, signed in as front desk', [
    S('Look for Messages & offers in the menu', ['It is not there; only the workout offer list and Automatic reminders are open to the desk'], ['A greyed-out entry', 'The group picker shown to the desk']),
    S('Open the workout offer list from its own link', ['The offer list, with no way to write a message to a group'], ['A send button for the desk']),
  ], [], [], []);
  J(F, 'staff', 3, 'The browser address bar, signed in as front desk', [
    S('Type the address of Messages & offers', ['The desk is sent to another page (the old link goes to Shop); no group picker'], ['The Who gets it section opens', 'A blank page']),
  ], [], [], []);
  J(F, 'staff', 6, 'Signed in as front desk, then the owner signs in on the same browser', [
    S('As desk, try the address again after a reload', ['Still refused'], ['The page opens after a reload']),
    S('Sign out, the owner signs in', ['Messages & offers is in the menu with the group picker'], ['The desk refusal sticks for the owner']),
  ], [], [], []);
  N(F, 'staff', 2, 'no other way in: the page is closed to the front desk whichever link is used');
  J(F, 'staff', 12, 'Signed in as front desk', [
    S('Try to send a message to members by any page the desk can open', ['No such control; the server sends messages only for the owner'], ['A desk login sends a message to members', 'The desk sees the count of app members of a group']),
  ], [], [], []);
  for (const t of [4, 5, 7, 8, 9, 10, 11]) N(F, 'staff', t, 'the front desk cannot open Messages & offers, so there is no screen or save of this feature for this role to vary');
}

// ================================================================ F-panel-609 Automatic reminders
{
  const F = 'F-panel-609';
  const E = ['E-gym-auto-reminders'];
  J(F, 'owner', 1, 'Messages & offers, Automatic reminders, signed in as owner, gym online', [
    S('Open Automatic reminders', ["The heading 'Automatic reminders' and 11 reminders, each with a switch, when it goes and an example in the gym's name (for example 'Happy birthday, Asha! Best wishes from all of us at <gym>.')"], ["'{gym}' shown as raw text", 'A reminder missing from the list']),
    S("Switch 'We haven't seen you' on and type 14 in 'Days without a check-in'", ["The button 'Save changes' becomes active"], ['The change saved before Save is tapped']),
    S("Tap 'Save changes'", ["'Saving…' then 'Saved. Members' phones pick this up the next time they open MettleUp.'"], ['A saved message when the server refused', 'Other switches changed by this save']),
    S('Reload the page', ['The same switches and days as saved'], ['The defaults shown again']),
  ], E, E, ['P-A7-templates-2-33', 'P-A7-templates-2-25']);
  J(F, 'owner', 3, 'Automatic reminders, signed in as owner', [
    S("In 'Plan ends soon' type 0, or 45, or four numbers", ["'Days before the last day: whole numbers from 1 to 30, up to 3 (like 7, 3).' and Save changes cannot be tapped"], ['A day outside the range saved', 'The wrong number silently dropped and the rest saved']),
    S("In 'We haven't seen you' type 3", ["'Days without a check-in: a whole number from 5 to 60.'"], ['3 saved']),
    S('Open the page in a gym whose records are not online', ["'Automatic reminders need your gym online' and 'Members' phones read your choices from the server. Put your gym's records online first (Settings → Staff & sign-in).'"], ['Switches that look saved but reach no phone']),
    S('The server refuses a number', ["'One of the numbers is not allowed. Check the days and try again.'"], ['A raw error code such as INVALID on screen']),
  ], [], E, []);
  J(F, 'owner', 6, 'Automatic reminders, signed in as owner; Birthday wish is on', [
    S('Open the page without changing anything', ["'Save changes' cannot be tapped"], ['A save with nothing changed']),
    S("Switch 'Birthday wish' off and save", ['Saved; Today and the AI Assistant at once suggest wishing every birthday member again'], ['Today still hiding birthday members as if the wish were automatic']),
    S('Switch it on again and save', ['Saved; Today again leaves out the members who get the automatic wish'], ['Two wishes for one member on one day']),
    S("Type '7, 7, 3' in Plan ends soon and save", ['Saved as 7, 3 (largest first, each once)'], ['The same day saved twice', 'Two reminders on one day']),
  ], E, E, ['P-A7-whats-new-1-04', 'P-A7-templates-2-33']);
  J(F, 'owner', 2, 'Automatic reminders, signed in as owner; the other way in: a gym that never saved, and a row saved by an older version', [
    S('Open the page in a gym that never saved', ['The defaults: Plan ends soon (7, 3), Plan ends today, Plan ended (7, 1), Birthday wish, Welcome and Workout offer: days added are on; the other five are off'], ['Everything off', 'Everything on']),
    S('Open the page when the saved row lacks a newer reminder or holds a day outside the range', ['That reminder shows its default; the others show what was saved'], ['The whole page falls back to defaults', 'A day outside the range shown or used']),
  ], [], E, []);
  J(F, 'owner', 12, 'Automatic reminders; first the owner, then the front desk on its own device', [
    S('As owner read who changed it last', ['The name of the person who saved and when, if the page shows it (exact words: unknown)'], ['Another gym\'s settings']),
    S('As front desk open Automatic reminders', ["The same list, every switch locked, and 'Only the owner can change these.'; no Save button"], ['The desk can switch or save', 'A greyed Save button that still works']),
    S('As front desk force a save', ["'Only the owner can change automatic reminders.'"], ['The setting changes']),
  ], [], E, ['P-A7-templates-2-33']);
  Y(F, 'owner', 4, ['T4-zero', 'T4-planedge', 'T4-zeroprice'], 1, 'E-gym-auto-reminders', 'Never saved means defaults; a plan that ends today and a free plan must get the right reminder words');
  Y(F, 'owner', 5, ['T5-midnight', 'T5-endstoday', 'T5-joinedtoday', 'T5-zone'], 3, 'E-gym-auto-reminders', "Phones act on the days at 9:30 am; a save near midnight and a phone in another time zone decide which day counts");
  Y(F, 'owner', 7, ['T7-doubletap', 'T7-offline', 'T7-back', 'T7-twostaff'], 3, 'E-gym-auto-reminders', 'Save is guarded by a busy flag; two owners saving at once: the later save sends every case and overwrites the first');
  Y(F, 'owner', 8, ['T8-language', 'T8-theme', 'T8-alerts'], 1, 'E-gym-auto-reminders', "Titles and examples are fixed English; a member who turned gym reminders off on the phone must get none");
  Y(F, 'owner', 9, ['T9-360', 'T9-laptop', 'T9-dark', 'T9-bigfont'], 1, 'E-gym-auto-reminders', 'Eleven rows with a switch, an example and a days box each');
  Y(F, 'owner', 10, ['T10-olddata', 'T10-midway'], 1, 'E-gym-auto-reminders', 'A row saved before a reminder was added keeps that reminder on its default; an old phone app must ignore a case it does not know');
  Y(F, 'owner', 11, ['T11-apppanel', 'T11-twopanels'], 3, 'E-gym-auto-reminders', "The member phone picks the change up the next time MettleUp opens; the reminder it shows must match the switch and the days");
}

// ================================================================ F-panel-610 Automatic birthday wish
{
  const F = 'F-panel-610';
  const R = ['E-gym-auto-reminders', 'E-gym-members', 'E-crm-records'];
  for (const role of ['owner', 'staff']) {
    J(F, role, 1, `Today, signed in as ${role}; the Birthday wish reminder is on; two members have a birthday today, one of them uses the app with the same mobile number and first name`, [
      S('Open Today and wait a moment', ["While the panel is still asking the server the birthday count is 0; then the tile says '1 member gets no automatic birthday wish today' with 'Send a wish'"], ['The member who gets the automatic wish is counted', 'Both members counted', 'A count that flickers 2 then 1']),
      S('Open the tile', ['Only the member without the automatic wish is offered for a message'], ['The app member is offered a second wish']),
    ], [], R, ['P-A7-whats-new-1-04']);
    J(F, role, 3, `Today, signed in as ${role}; cases where the automatic wish does NOT reach a birthday member`, [
      S('Two list members share one mobile number and one has a birthday today', ['That member is counted as getting no automatic wish'], ['The member treated as covered']),
      S("The app member's first name differs from the list ('Asha' on the list, 'Aasha' in the app)", ['Counted as getting no automatic wish'], ['Treated as covered']),
      S('The birthday member has no app, or an archived record', ['No app: counted; archived: not counted at all'], ['An archived member in the count']),
      S('The server cannot be reached for the switch or the app members', ['Today behaves as before the feature: every birthday member is suggested'], ['Nobody suggested', 'An error shown on Today']),
    ], [], R, ['P-A7-whats-new-1-04']);
    J(F, role, 6, `Today, signed in as ${role}; the Birthday wish reminder changes`, [
      S(role === 'owner' ? 'Switch Birthday wish off in Automatic reminders, save, open Today' : 'The owner switches Birthday wish off on another device; wait up to 5 minutes on Today', ['Every birthday member is suggested for a wish'], ['Today still leaves out the app members']),
      S(role === 'owner' ? 'Switch it on again, save, open Today' : 'The owner switches it on again; wait up to 5 minutes', ['Only members without the automatic wish are suggested'], ['A stale answer from before the save wins over what was just saved']),
      S('A covered member leaves the gym in the app', ['Within about 5 minutes that member is suggested again'], ['The member stays hidden all day']),
    ], role === 'owner' ? ['E-gym-auto-reminders'] : [], R, ['P-A7-whats-new-1-04']);
    if (role === 'owner') {
      J(F, role, 2, 'Today, the AI Assistant card, signed in as owner; Birthday wish is on', [
        S('Read the AI Assistant ideas on a day with one covered and one uncovered birthday', ['The birthday idea names only the member who gets no automatic wish'], ['The assistant suggests wishing the member who already gets it', 'An idea is drafted and credits spent for a covered member']),
        S('Every birthday member is covered', ['No birthday idea'], ['A birthday idea with nobody in it']),
      ], [], R.concat(['E-gym-ai-tasks']), ['P-A7-whats-new-1-04']);
    } else {
      N(F, role, 2, 'no other way in for the front desk: the AI Assistant is the owner\'s; the desk sees only the Today tile');
    }
    J(F, role, 12, `Today, signed in as ${role}`, [
      S('Read the birthday tile and the list behind it', ['Counts and the names of this gym\'s own members only'], ['An app member who is not on this gym\'s list named', 'A mobile number of an app member shown']),
      S('Compare with the member phone at 9:30 am', ["The covered member gets 'Happy birthday, <first name>! Best wishes from all of us at <gym>.' and no second gym reminder that day"], ['A member the panel calls covered gets nothing', 'More than one gym reminder on the phone that day']),
    ], [], R, ['P-A7-whats-new-1-04', 'P-A7-templates-2-33', 'P-A7-templates-2-25']);
    Y(F, role, 4, ['T4-zero', 'T4-one', 'T4-hinglish', 'T4-emoji', 'T4-many'], 1, 'E-crm-records', 'A name in Devanagari or with an emoji is cut to letters only before the first names are compared; the server keeps fewer characters than the browser may, so the two can disagree');
    Y(F, role, 5, ['T5-midnight', 'T5-joinedtoday', 'T5-zone'], 1, 'E-crm-records', 'Birthday today is judged on the gym day; 29 February and a panel open across midnight need a look');
    Y(F, role, 7, ['T7-offline', 'T7-twostaff'], 1, 'E-gym-auto-reminders', 'Offline there is no key, so the old behaviour returns; a save while a read is out must win');
    Y(F, role, 8, ['T8-language', 'T8-alerts'], 1, 'E-gym-auto-reminders', 'The switch is the Birthday wish reminder itself; the member can also turn gym reminders off on the phone, which the panel cannot see');
    Y(F, role, 9, ['T9-360', 'T9-dark'], 1, 'E-crm-records', "The long tile words '{n} members get no automatic birthday wish today' must fit a small tile");
    Y(F, role, 10, ['T10-olddata'], 1, 'E-gym-auto-reminders', 'A server without the reminders function answers as off; old records carry an app link field that is now ignored');
    Y(F, role, 11, ['T11-apppanel', 'T11-twopanels'], 1, 'E-gym-members', 'What the panel calls covered must be what the phone really shows at 9:30 am');
  }
}

// ================================================================ F-panel-611 Batches
{
  const F = 'F-panel-611';
  const E = ['E-crm-records'];
  for (const role of ['owner', 'staff']) {
    J(F, role, 1, `Members, Add member, signed in as ${role}; the gym has no batch yet`, [
      S("Open the add-member form and find 'Batch (optional)'", ["A text box with the hint 'Up to 40 letters.' (no chips yet)"], ['Batch is required to save']),
      S("Type 'Morning 6-8' and save the member", ['The member is saved with that batch'], ['The batch saved with extra spaces']),
      S('Add a second member', ["'Morning 6-8' is offered as a chip, the most used batch first; one tap picks it"], ['The chip missing', 'The same batch as two chips']),
      S('Open Members and the batch filter', ["'All batches (N)' and 'Morning 6-8 (2)'; picking it lists the two members"], ['A count that differs from the rows', 'Members of another batch listed']),
    ], E, E, []);
    J(F, role, 3, `Add or edit member, signed in as ${role}; 'Morning 6-8' exists`, [
      S("Type 'morning   6-8' and save", ["Saved as the gym's first spelling 'Morning 6-8'"], ['A second batch in the filter']),
      S('Type only spaces and save', ['The member has no batch'], ['An empty chip', 'A batch named with spaces']),
      S('Type more than 40 letters', ['The box stops at 40 letters or says so (which: unknown, not read in code)'], ['A long name cut without a word', 'A chip that breaks the layout']),
    ], E, E, []);
    J(F, role, 6, `Members with the batch filter, signed in as ${role}`, [
      S("Pick 'Morning 6-8' in the filter, then archive its last member", ['The picked batch stays in the filter with (0) until another is picked'], ['The filter jumps to another batch', 'The list shows everyone while the filter still names the batch']),
      S("Pick 'All batches' and open the filter again", ['A batch that only archived members carry is not offered'], ["A '(0)' batch offered"]),
      S("Edit a member and clear the batch", ['The member is under the no-batch choice and the batch count is one lower'], ['The old batch still shown on the member']),
      S('Bring the archived member back', ['The batch is offered again with its count'], ['The member comes back without the batch']),
    ], E, E, []);
    J(F, role, 2, `Other places the batch is used, signed in as ${role}: Attendance${role === 'owner' ? ' and Messages & offers' : ''}`, [
      S('On Attendance pick a batch above the check-in box and type a name from another batch', ["'Nobody matches that' and 'Searching only <batch>. Pick “All batches” to search everyone.'"], ['A member of another batch offered', 'No hint why nobody matches']),
      S('Pick a batch with nobody in it today', ["'Nobody in this batch'"], ['A blank list']),
      S(role === 'owner' ? "On Messages & offers pick the group 'In one batch' and the batch" : 'Open the Losing the habit export on Attendance', [role === 'owner' ? 'Only members of that batch who are not archived are in the group' : "The file has a 'Batch' column with each member's batch"], [role === 'owner' ? 'Members with no batch in the group' : 'The batch column empty for members who have one']),
    ], [], E, []);
    N(F, role, 12, 'a batch is a time-slot label kept on the member record and shown only inside the gym\'s own panel; no promise names it and it shows nothing new to anyone');
    Y(F, role, 4, ['T4-zero', 'T4-one', 'T4-many', 'T4-long', 'T4-hinglish', 'T4-emoji'], 2, 'E-crm-records', 'Two spellings are one batch only by lower case and spaces; Hindi names and emoji must compare and sort');
    N(F, role, 5, 'no time edge: a batch is a name, nothing about it is dated or counted by day');
    Y(F, role, 7, ['T7-twostaff', 'T7-offline', 'T7-back'], 2, 'E-crm-records', 'Two desks typing the same new batch in two spellings at once can leave two spellings; the first one met wins the display');
    Y(F, role, 8, ['T8-language', 'T8-theme'], 1, 'E-crm-records', "The labels go through the translator; the batch name itself is the gym's own words");
    Y(F, role, 9, ['T9-360', 'T9-laptop', 'T9-dark', 'T9-bigfont'], 3, 'E-crm-records', 'Many chips with 40-letter names must wrap on a phone');
    Y(F, role, 10, ['T10-olddata'], 4, 'E-crm-records', 'Members saved before batches existed have no batch field and must read as no batch');
    Y(F, role, 11, ['T11-twopanels'], 2, 'E-crm-records', 'A batch typed on the phone must be a chip on the laptop after the next sync');
  }
}

// ================================================================ F-panel-613 Body measurements
{
  const F = 'F-panel-613';
  const E = ['E-gym-body-measurements'];
  for (const role of ['owner', 'trainer']) {
    const prom = role === 'trainer' ? ['P-A7-whats-new-1-97', 'P-A7-whats-new-2-98', 'P-A7-panel-2-27'] : ['P-A7-whats-new-1-97', 'P-A7-whats-new-2-98'];
    J(F, role, 1, `A member's page, signed in as ${role}, gym online; the member was measured once last month`, [
      S("Scroll to 'Body measurements'", ["The last entries, newest day first, who measured, and '+ Add'", "The line 'Members see these in their MettleUp app (Progress → Body) after they check in at the gym once.'"], ['Another member\'s entries', "'+ Add' shown while offline"]),
      S("Tap '+ Add'", ["A sheet 'Add measurements' with today's date, Body weight (kg), Body fat (%), nine tape sizes in cm (Waist, Chest, Arm, Hips, Thigh, Neck, Shoulders, Forearm, Calf) and a note"], ['A future date as the start value']),
      S('Type 72,5 for weight and 84 for waist, save', ["'Measurements saved. <name> sees them in the MettleUp app.'", "The new entry shows '72.5 kg' with the change since last time (for example −1.5) and '84 cm'"], ['72,5 refused or saved as 725', 'A change shown against the wrong earlier entry', 'Two entries for one tap']),
    ], E, E.concat(['E-crm-records']), prom);
    J(F, role, 3, `The Add measurements sheet, signed in as ${role}`, [
      S('Save with every box empty', ["'Type at least one measurement.'"], ['An empty entry saved']),
      S('Type 500 for weight, 1 for body fat, 400 for waist', ["'Body weight: a number from 20 to 350 kg.', 'Body fat: a number from 2 to 75 %.', 'Waist: a number from 5 to 300 cm.' each at its box"], ['Only the first problem shown', 'A value outside the range saved']),
      S('Pick tomorrow as the day', ["'The day can’t be in the future.'"], ['A future entry saved']),
      S('Save a second entry on a day that already has one', ["'This member already has measurements on that day. Edit that entry instead.'"], ['Two entries on one day', 'The old entry overwritten without a word']),
      S('Type a note of more than 200 letters', ["'Note: up to 200 letters.'"], ['The note cut without a word']),
    ], [], E, []);
    J(F, role, 6, `A member's page with a saved entry, signed in as ${role}`, [
      S("Open the entry", ["A sheet 'Fix measurements' with the saved values"], ['Empty boxes for saved values']),
      S('Change the weight and save', ["'Measurements updated.'; the change figures of this and the next entry follow"], ['A second entry instead of a changed one']),
      S("Tap delete", ["'Delete these measurements?' with 'Delete'; then 'Deleting…' and 'Measurements deleted.'"], ['Deleted with one tap and no question', 'Another day deleted']),
      S('Open an entry that someone else deleted a moment ago and save', ["'That entry was deleted on another device. Close this and look again.'"], ['The deleted entry comes back', 'A raw code such as NOT_FOUND']),
      S('The member was removed from the list meanwhile; save', ["'This member is not on your gym’s list any more.'"], ['The entry saved for a member who is gone']),
    ], E, E, []);
    N(F, role, 2, 'one way in only (the Body measurements card on the member page); every measurement kind is a box on the same sheet');
    J(F, role, 12, `A member's page, signed in as ${role}; then the member's own phone`, [
      S('Save an entry with a note for the desk', ['The note shows in the panel only'], ['The note sent to the member']),
      S('The member opens MettleUp, Progress, Body (after one check-in at the gym)', ["The same numbers, marked as from the gym by its name"], ['Another member\'s numbers', 'The numbers shown before the member ever checked in at this gym', "The gym's entry overwriting the member's own entry of that day without a mark"]),
      S(role === 'trainer' ? 'As trainer open a member who is not assigned to this trainer' : 'As front desk (not a trainer) open the same member', [role === 'trainer' ? 'What a trainer may see of other members: unknown here (this card has no check of its own; the server decides)' : 'The card is there for the desk too (this card has no role check of its own; the server decides)'], [role === 'trainer' ? 'A trainer reads or changes measurements of a member who is not theirs, if the trainer promise covers this card' : 'Body numbers of a member shown to a person the gym did not mean']),
    ], E, E, prom);
    Y(F, role, 4, ['T4-zero', 'T4-one', 'T4-many', 'T4-long', 'T4-hinglish', 'T4-emoji'], 3, 'E-gym-body-measurements', "No entry shows 'No measurements yet'; only the first few show until 'Show all N'; numbers are rounded to one decimal on save; the note takes Hindi and emoji");
    Y(F, role, 5, ['T5-midnight', 'T5-zone', 'T5-joinedtoday'], 2, 'E-gym-body-measurements', "One entry per member per day: the sheet's today and the server's today must be the same India day or a valid day is refused");
    Y(F, role, 7, ['T7-doubletap', 'T7-offline', 'T7-back', 'T7-twostaff'], 3, 'E-gym-body-measurements', 'Save and delete are guarded by a busy flag; back on a half-typed sheet drops what was typed (whether it asks first: unknown)');
    Y(F, role, 8, ['T8-language', 'T8-theme', 'T8-units'], 2, 'E-gym-body-measurements', 'The panel is always kg and cm; a member whose app is set to lb or inches must see the same measurement converted, not relabelled');
    Y(F, role, 9, ['T9-360', 'T9-laptop', 'T9-dark', 'T9-bigfont'], 2, 'E-gym-body-measurements', 'Eleven number boxes and a note in one sheet; Save must stay reachable above the phone keyboard');
    Y(F, role, 10, ['T10-olddata'], 1, 'E-gym-body-measurements', "On a server without this function the card shows no '+ Add'; rows the panel cannot read are dropped from the list without a word");
    Y(F, role, 11, ['T11-apppanel', 'T11-twopanels'], 3, 'E-gym-body-measurements', 'The member app must show the entry, and a fix or delete in the panel must follow there');
  }
}

// ================================================================ finding
rows.push({
  kind: 'finding', id: `FN-${WI}-01`, date: '2026-11-19', lens: 'A5', surface: 'panel', area: 'panel/logic-1',
  refs: ['J-F-panel-605-01', 'F-panel-605'], severity: 'S3',
  title: "Today's member news depends on the clock of the phone or laptop",
  what: "Today lists member news of the last 24 hours and writes how long ago each came, by comparing the server's time with the clock of the device. On a device whose clock runs a day ahead, messages and requests that still need someone drop off Today; on a device that runs behind, old lines stay and say 'Just now'. The server's own clock comes with the list but is not used here.",
  expected: 'Today uses the server\'s clock for the 24 hour cut and for the age words, so a wrong device clock never hides a line that still needs someone.',
  evidence: ['apps/dashboard/src/crm/ui/NeedsYou.tsx:607-613', 'apps/dashboard/src/crm/ui/NeedsYou.tsx:665', 'apps/dashboard/src/crm/logic/alertInbox.ts:164-171', 'apps/dashboard/src/crm/logic/alertInbox.ts:51-52'],
  proof: 'code-read', root_cause_key: 'today-alerts-use-device-clock', who: 'owners, front desk and trainers on a device with a wrong clock',
  how_often: 'only on a device whose clock is wrong by hours', fix_line: "Use the server's clock that comes with the list for the cut and the age words", fix_size: 'small', needs_him: false, verified: 'pending', status: 'open',
});

fs.mkdirSync(path.join(MAP, '_work', 'out'), { recursive: true });
fs.writeFileSync(path.join(MAP, '_work', 'out', `${WI}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const names = ['F-panel-605', 'F-panel-604', 'F-panel-607', 'F-panel-608', 'F-panel-609', 'F-panel-610', 'F-panel-611', 'F-panel-613'];
const cp = [
  `# Checkpoint ${WI}`, '',
  ...names.map((f) => `${f}: ${counts.get(f).j} journeys, ${counts.get(f).t} type lines`), '',
  'All 8 features done. 1 finding row (FN-A5-panel-logic-1-1-01).', '',
  '## Entities',
  '- No entity for "which alerts this person has read, opened or removed" (per person bell state) and none for "news already shown on Today" (kept in the browser): E-gym-alerts used for both.',
  '- No entity of its own for visits, members, enquiries or batches: all are E-crm-records.',
  '- F-panel-608 staff, F-panel-611: no promise fits; promise_ids left empty.', '',
  '## Seen in passing (not findings, not checked further)',
  "- Today drops a message or request that still needs someone once it is older than 24 hours (alertInbox.ts:164-171); the bell keeps it. The What's new words say Today shows what still needs you.",
  '- The panel\'s own second check hides only complaints from non-owners (gymAlerts.ts:146-148); feedback for trainers is left to the server alone, and the panel has no trainer role (permissions.ts:88-90).',
  '- The Losing the habit export (names and mobile numbers) has no role check in Attendance.tsx:774-797; the front desk can download it.',
  '- MemberMeasurements.tsx has no role check for Add, Fix or Delete (lines 78-84); who may do it rests on the server alone. The feature row names owner and trainer only.',
  '- An alert is matched to an enquiry by time alone, including the enquiry\'s last-changed time (alertHandled.ts:193-205): an unrelated enquiry edited within 2 seconds of an alert could mark the wrong line handled or waiting.',
  '- Everyone count adds every app member that has no readable mobile number (audience.ts everyoneCount): a list member whose app record has no number is counted twice.',
  '- Saved reminder days that are all outside the range are silently replaced by the defaults on load (autoReminders.ts:145-160).',
  '- Measurements are rounded to one decimal on save with no word to the user (bodyMeasures.ts parseBox).',
  '- A failed read, opened, remove or undo of a bell line is only written to the console (NeedsYou.tsx:369-374); the list is read again, so the line quietly comes back.', '',
  '## Could not check',
  '- Trainer role: which alerts the server sends a trainer, and whether a trainer can open measurements of members who are not theirs (server code not read; not in this brief).',
  '- Exact words of: the check-in success message, the BellInbox card labels, the 40-letter limit on the batch box, who-changed-it line on Automatic reminders, the staff redirect target for Messages & offers (code-line limit reached).',
  '- Whether a scheduled message works out its group again at send time (send code not read).',
  '- Nothing was driven on screen and no test file was opened: every journey has coverage "unknown".',
  '- Code lines read: about 2,950 of 3,000.',
];
fs.writeFileSync(path.join(MAP, '_work', `${WI}.md`), cp.join('\n') + '\n');
console.log(rows.length, 'rows', [...counts].map(([f, c]) => `${f}:${c.j}/${c.t}`).join(' '));
