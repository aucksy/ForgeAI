import { J, Y, N, F, flush } from './gen.mjs';
const C = 'E-crm-records';
const D = 'E-gym-diet-plans';
// ---------- F-panel-622
let f = 'F-panel-622';
for (const role of ['owner', 'trainer']) {
  const owner = role === 'owner';
  J(f, role, 1, `Diet plans on ${owner ? 'the owner' : 'a trainer (staff)'} login, gym online, no plans yet`, [
    ['Open Diet plans', ['Page "Diet plans" with "Send members what to eat" and the button "+ New plan"', '"No diet plans yet" with "Start from a ready-made plan, like “Fat loss veg · 1,600 kcal”, change what you like, and send it to members or to everyone on a membership plan."'], ['An endless loading state', 'Plans of another gym']],
    ['Tap "+ New plan"', ['Sheet "New diet plan" with the groups "Veg" ("No eggs, meat or fish") and "Non-veg" ("With eggs, chicken or fish"), and "Start empty" ("Write every meal yourself")', '"Each ready-made plan is for an adult of about 60 to 70 kg who trains 3 to 5 days a week. It uses everyday Indian food and is not medical advice."'], ['Fewer than six ready-made plans', 'A ready-made plan with no doctor line']],
    ['Pick a ready-made plan', ['The builder with "Plan name", "Goal (optional)", "Calories a day (optional)", "Protein a day (optional)", the meals each with "Meal", "Time (optional)" and "Food, one per line", and "Notes for the member (optional)"', 'The calories and protein boxes match the food listed'], ['Meals in the wrong order', 'Boxes that do not grow, hiding typed food']],
    ['Tick members or a membership plan to send it to, then save', ['Toast "“<title>” saved and sent." (with nobody ticked: "“<title>” saved. Tick members to send it.")', 'The plan under "Plans" with a line like "6 meals · 1,600 kcal · 90 g protein"'], ['Two plans after a double tap', 'The plan sent to a member who was not ticked', '"saved and sent" shown when the save failed']],
  ], [D], [D, C], ['P-A7-whats-new-1-34', 'P-A7-whats-new-1-96']);
  J(f, role, 2, 'A member page, the "Diet plan" section (another way in: send to one member)', [
    ['Tap the send button in the "Diet plan" section', ['Sheet "Send a diet plan to <name>" with "Your gym’s diet plans" (a plan the member already gets shows "Already sent") and "Or make one for them": "Start from a ready-made plan", "Write a new plan"'], ['Withdrawn plans offered', 'A plan the member gets through their membership plan not marked "Already sent"']],
    ['Tap a plan', ['Toast "“<title>” sent to <name>." and the plan listed in the section'], ['Other members taken off the plan by this save', 'Another person edits of the same plan overwritten without a word']],
    ['Tap the stop button for that plan', ['Toast "<name> no longer gets “<title>”."'], ['The plan withdrawn for everyone', 'The member still seeing it in the app after opening the Gym tab']],
  ], [D], [D, C], ['P-A7-whats-new-1-96']);
  J(f, role, 3, 'The diet plan builder, started with "Start empty"', [
    ['Save with the name empty', ['"Give the plan a name, like “Fat loss veg”."'], ['A plan saved with no name']],
    ['Type a name, leave every meal without food, save', ['"Add the food for at least one meal (one food per line)."'], ['An empty plan sent to members']],
    ['Type 500 in "Calories a day (optional)", then food under a meal with no meal name', ['"Calories a day: a whole number from 800 to 6000, or leave it empty.", then "Each meal with food needs a name, like “Breakfast”."'], ['A dangerous calorie figure sent to a member', 'Typed meals lost after the refusal']],
    ['Open Diet plans while the gym is not online', ['"Diet plans need your gym online" with "Members’ phones read the plans from your gym’s server. Put your gym online first (Settings → Sign-in & data)."'], ['A "+ New plan" button that cannot save']],
  ], [], [D], []);
  J(f, role, 6, 'Diet plans, one plan that is sent to members', [
    ['Tap "Edit", change a meal, save', ['Sheet "Edit diet plan", then toast "“<title>” updated."'], ['A second plan made in place of the change', 'Members losing the plan after an edit']],
    ['Tap "Withdraw"', ['"Withdraw this plan?" with "<title> will stop showing in members’ apps the next time they open the Gym tab. You can’t send this plan again; make a copy of it instead."', 'Buttons "Keep it" and "Withdraw"'], ['A withdraw with no question first']],
    ['Tap "Withdraw"', ['Toast "Plan withdrawn." and the plan under the line "Members no longer get these.", with only a copy button'], ['The plan deleted from the list', 'Members still getting it']],
    ['Make a copy of the withdrawn plan', ['The builder with the name "<title> (copy)" and nobody ticked'], ['The copy already sent to the old members', 'An edit of the withdrawn plan accepted (the server says "This plan was withdrawn, so it can’t be changed. Make a copy of it instead.")']],
  ], [D], [D], ['P-A7-whats-new-1-34']);
  J(f, role, 12, 'A plan sent to one member; what the member and others can see', [
    ['Read the note under the plans', ['"Members see their plan in the MettleUp app (Gym → Diet plan) after they check in at the gym once."'], ['A member who was not ticked, and is not on the ticked membership plan, seeing the plan', 'A member of another gym seeing it']],
    ['Look at the notes of a ready-made plan', ['The line "Talk to a doctor if you have a health condition." and a line to show the plan to a doctor first for under 18, pregnancy, diabetes, high BP, kidney disease or a food allergy'], ['A ready-made plan sent with no health line', 'The plan worded as medical advice']],
    owner
      ? ['Sign in as front desk staff and open Diet plans', ['Staff who may send workout plans can open it; a login without that right gets the owner-only screen'], ['A login with no right to plans changing what members eat']]
      : ['Look for money or member fees on the page', ['Only plans and member names'], ['Fees, dues or phone numbers shown on the diet page']],
  ], [], [D, C], ['P-A7-whats-new-1-96']);
  Y(f, role, 4, ['T4-zero', 'T4-long', 'T4-hinglish', 'T4-emoji', 'T4-many'], 4, D, 'Limits: name 80, 10 meals, 20 lines of 120 letters, notes 1000; Hindi food names; a plan sent to a whole membership plan');
  Y(f, role, 5, ['T5-endstoday', 'T5-joinedtoday', 'T5-zone'], 4, D, 'A plan sent through a membership plan reaches a member only while that membership covers today');
  Y(f, role, 7, ['T7-back', 'T7-doubletap', 'T7-offline', 'T7-twostaff'], 4, D, 'Send to one member saves the whole plan again: two people changing it at once can overwrite each other');
  N(f, role, 8, 'no setting belongs to diet plans: the words are English and no alert or permission is used on the panel side');
  Y(f, role, 9, ['T9-360', 'T9-bigfont', 'T9-laptop'], 3, D, 'A long builder sheet with growing text boxes and up to 10 meals');
  Y(f, role, 10, ['T10-olddata'], 1, D, 'Plans saved before the ready-made plans came must still open and edit');
  Y(f, role, 11, ['T11-apppanel', 'T11-twopanels'], 4, D, 'The member reads the plan in the app after one check-in; a withdraw must reach the phone on the next Gym tab open');
}
// ---------- F-panel-623
f = 'F-panel-623';
for (const role of ['owner', 'staff']) {
  const owner = role === 'owner';
  J(f, role, 1, `Enquiries on ${owner ? 'the owner' : 'a front desk (staff)'} login; a person walks in and asks about joining`, [
    ['Open Enquiries and start adding one', ['Page "Enquiries" with "People who asked about joining"', 'Sheet "Add enquiry" with "Name", "Code", "Mobile number", "Interested in (optional)", "Where did they hear about us? (optional)" (Walk-in, Instagram, Friend, Google, Justdial, Other, or "Not asked") and "Follow-up date" set to tomorrow with "Call back on <day> (tomorrow)"'], ['A follow-up date of today or empty by default']],
    ['Fill it in and save', ['The person in the list under the later group, with their number and what they asked about'], ['Two rows after a double tap', 'The number saved without its country code']],
    ['On the follow-up day, open Enquiries', ['The person under the due group, with "Call", "WhatsApp", "Add as member", "Follow-up date" and "Not interested"'], ['A due enquiry missing from the due count in the menu']],
    ['Tap "WhatsApp"', ['WhatsApp opens with "Hi <first name>, you asked about <gym> (<interest>)." then "Would you like to start this week? Reply here if you have any questions, or come to the gym." and "– <gym>"; nothing is sent until the user presses send'], ['A message sent by itself', 'A note the gym wrote for itself, or the web page note "Asked on your web page: …" or "Joined online: …", inside the message']],
  ], [C], [C], ['P-A7-whats-new-1-09']);
  J(f, role, 2, 'Other ways in: the address /enquiries/new, and an enquiry that came from the gym web page or the online join page', [
    ['Open /enquiries/new', ['Enquiries with the "Add enquiry" sheet already open'], ['The list only, with no sheet']],
    ['Open an enquiry that came from the web page', ['The line "Asked on your web page" (or "Chat on your web page" with the whole chat) in place of the raw note', 'A visitor who only chatted shows "No number left yet" and no Call or WhatsApp button'], ['A Call or WhatsApp button with no number behind it', 'The raw server note shown twice']],
  ], [], [C, 'E-gym-page-chats', 'E-gym-self-joins'], ['P-A7-whats-new-1-29']);
  J(f, role, 3, 'The "Add enquiry" sheet', [
    ['Save with everything empty', ['"Type their name." on the name box'], ['An enquiry saved with no name']],
    ['Type a name, leave the number empty; then type 12345', ['"Type their mobile number.", then "This mobile number looks wrong. Check it and type it again."'], ['A wrong number saved', 'An empty box called "wrong"']],
    ['Paste "+91 98765 43210" into the number box', ['The box keeps 9876543210'], ['The country code doubled']],
    ['Set a follow-up date of yesterday', ['"The follow-up date can’t be in the past."'], ['An enquiry born overdue']],
    ['Type the number of a person who already has an open enquiry', ['A warning that this number already asked; saving is still allowed'], ['A silent second enquiry with no warning', 'A block that stops a family member with the same number']],
  ], [], [C], ['P-A7-whats-new-1-09']);
  J(f, role, 6, 'Enquiries, one open enquiry that is due today', [
    ['Tap "Follow-up date"', ['Sheet "Call <name> again" with "Tomorrow", "In 3 days", "In a week" and "Or pick a date"'], ['A past date accepted']],
    ['Pick "In 3 days"', ['The enquiry moves to the later group; the due count goes down by one'], ['The enquiry in both groups']],
    ['Tap "Not interested", pick a reason under "Why did <name> not join? (optional)"', ['The pill "Not interested" with the reason; only "Reopen" is left'], ['The person deleted', 'Call-back reminders still counted for a lost enquiry']],
    ['Tap "Reopen", then "Add as member" and finish the member form', ['The enquiry shows as joined with "Open member"; a person already on the list gets "Already a member" (or "Already a member (archived)")'], ['A second member with the same number', 'The enquiry left open after the member was saved without the line "The member was saved, but the enquiry was not closed."']],
  ], [C], [C], []);
  J(f, role, 12, 'Enquiries: who can see a person who only asked, and what leaves the gym', [
    ['Read "Where enquiries came from" and the list', ['Only this gym (this branch) enquiries, with name, number and what they asked'], ['Enquiries of another gym', 'The number of a web page visitor who did not leave one']],
    ['Open a web page chat older than 90 days', ['A line that the chat messages were deleted 90 days after the last one'], ['Old chat text still shown']],
    owner
      ? ['Tap "Mark as done" on a web page chat that waits for the owner', ['The chat no longer waits'], ['The enquiry itself closed or deleted']]
      : ['Look for an action only the owner may take', ['Staff can add, call, message, move and close enquiries'], ['Staff giving free days for a friend referral that only the owner may give']],
  ], owner ? [C] : [], [C, 'E-gym-page-chats', 'E-gym-friend-referrals'], ['P-A7-panel-3-18']);
  Y(f, role, 4, ['T4-zero', 'T4-one', 'T4-many', 'T4-long', 'T4-hinglish', 'T4-emoji'], 2, C, 'Name up to 80 and interest up to 200 letters; the interest text goes into the WhatsApp message; empty filters say "Nobody to call today"');
  Y(f, role, 5, ['T5-midnight', 'T5-zone', 'T5-monday'], 3, C, 'Overdue, today and later are split by the India day; the default follow-up is tomorrow');
  Y(f, role, 7, ['T7-back', 'T7-doubletap', 'T7-offline', 'T7-twostaff', 'T7-call'], 2, C, 'Two desks working the same enquiry; the desk leaves for a call or WhatsApp from this very screen');
  N(f, role, 8, 'no setting belongs to enquiries on the panel: the words are plain English and nothing is sent by itself');
  Y(f, role, 9, ['T9-360', 'T9-bigfont', 'T9-laptop'], 3, C, 'Each enquiry card carries up to five buttons in a grid');
  Y(f, role, 10, ['T10-olddata'], 3, C, 'Enquiries saved before source and lost reason existed must show "Not asked" and "Not known"');
  Y(f, role, 11, ['T11-twopanels', 'T11-apppanel'], 2, C, 'An enquiry added on the desk phone, and one made by a member with Bring a friend, must reach the owner laptop');
}
// ---------- findings
const fn = (n, o) => F({ kind: 'finding', id: `FN-A5-panel-logic-1-2-0${n}`, date: '2026-11-19', lens: 'A5', surface: 'panel', area: 'panel/logic-1', ...o, proof: 'code-read', needs_him: false, verified: 'pending', status: 'open' });
fn(1, { refs: ['J-F-panel-623-01', 'J-F-panel-623-06'], severity: 'S3', title: 'The WhatsApp follow-up to a web-page enquiry carries the system note', what: 'For a person who asked on the gym web page or joined online, the ready WhatsApp message reads "you asked about <gym> (Asked on your web page: …)" or "(Joined online: …)". The enquiry card hides that note, the message does not.', expected: 'The message leaves out the system note, or uses only the words the person typed.', evidence: ['apps/dashboard/src/crm/logic/enquiries.ts:261-274', 'apps/dashboard/src/crm/ui/screens/Enquiries.tsx:440', 'apps/dashboard/src/crm/ui/screens/Enquiries.tsx:523', 'apps/dashboard/src/crm/gympage/logic.ts:332'], root_cause_key: 'followup-message-uses-raw-interest', who: 'owners and front desk, and the people they message', how_often: 'every WhatsApp tap on an enquiry that came from the web page or online join', fix_line: 'Strip the system prefixes before the interest goes into the message', fix_size: 'small' });
fn(2, { refs: ['J-F-panel-614-01', 'J-F-panel-620-02'], severity: 'S3', title: 'The growth Excel file shows a renewal rate the page hides', what: 'For a month whose 15 renewal days are not over, the page shows "–" for renewal rate and members lost, but the downloaded file gives a rate (often 100%) and a lost count made from the few plans decided so far.', expected: 'The file leaves the renewal rate and members lost empty for such a month, like the page.', evidence: ['apps/dashboard/src/crm/logic/businessGrowth.ts:335-338', 'apps/dashboard/src/crm/logic/businessGrowth.ts:587-603', 'apps/dashboard/src/crm/logic/businessGrowth.ts:258-267'], root_cause_key: 'growth-csv-ignores-settled-flag', who: 'owners', how_often: 'every download, for the latest one or two months', fix_line: 'Write the file from the same shown value as the page', fix_size: 'small' });
fn(3, { refs: ['J-F-panel-618-01', 'J-F-panel-618-05'], severity: 'S3', title: 'Workout code check calls entry-machine check-ins "imported"', what: 'In the summary line of "Check workout code", every matched day that was not at the desk or in the app is counted as "imported". A check-in at the entry machine falls in that group, while the row below it says "Checked in at the entry machine".', expected: 'The summary names entry-machine check-ins as such, and "imported" only for imported ones.', evidence: ['apps/dashboard/src/crm/logic/claimMatch.ts:53-71', 'apps/dashboard/src/crm/ui/WorkoutCodeCheckSheet.tsx:17', 'apps/dashboard/src/crm/types.ts:292'], root_cause_key: 'claim-summary-misses-machine-source', who: 'owners and front desk at gyms with an entry machine', how_often: 'every code check for a member who enters by the machine', fix_line: 'Count machine check-ins on their own in the summary', fix_size: 'small' });
flush();
