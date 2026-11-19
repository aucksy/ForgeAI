import { J, Y, N, flush } from './gen.mjs';
const C = 'E-crm-records';
const CH = 'E-gym-challenges';
const HIT = 'E-gym-challenge-hits';
// ---------- F-panel-617 owner
let f = 'F-panel-617';
const r = 'owner';
J(f, r, 1, 'Challenges, gym online, no challenge running', [
  ['Open Challenges', ['Page "Challenges" with "A challenge for your members. Everyone who reaches the goal wins."', 'A card "No challenge is running"', 'The button "New challenge"'], ['An endless "Loading…"', 'A challenge of another branch shown as this one']],
  ['Tap "New challenge"; type the Name, pick "Workouts" under "What counts", type the goal, the "First day", "How many days" and "Free days for everyone who reaches the goal"', ['Hints "Members see this name. At most 60 letters.", "Today or a later day, up to 60 days from today.", "From 7 to 31 days.", "From 0 to 60. You check each winner before the days are added."', 'A preview of what members will read, in place of "Fill in the boxes above to see what members will read."'], ['A preview that names other days or another goal than the boxes']],
  ['Tap "Start challenge"', ['The button reads "Saving…", then the toast "Challenge saved. Members see it in the MettleUp app within 10 minutes."', 'The challenge in the list as "Running now" or "Not started"'], ['Two challenges after a double tap', 'The toast shown when the save failed', 'A last day that is one day off from first day plus the number of days']],
], [CH], [CH], ['P-A7-help-1-26', 'P-A7-help-1-27']);
J(f, r, 2, 'Challenges, the ready-made challenges list (another kind of challenge)', [
  ['Tap the turn-on button of a ready-made challenge', ['A sheet with the ready-made name as its title and the boxes already filled'], ['Empty boxes', 'A first day in the past']],
  ['Save it', ['A toast that it is on, and the ready-made row now offers to change it or turn it off'], ['A second running challenge on the same days']],
], [CH], [CH], ['P-A7-help-1-26']);
J(f, r, 2, 'Challenges, the "Leaderboard · last 30 days" section (another kind: the standing board)', [
  ['Pick "Rank by" workouts or kg', ['The top members with their totals, or "Nobody to show yet. Totals appear after members train and open the MettleUp app."', '"<n> of your members trained in the last 30 days."'], ['A member who chose not to show their name listed by name']],
  ['Hide one member from the board', ['Toast "<name> is hidden from the leaderboard." and the name under "Hidden from members" with "Show again"'], ['The member still shown to other members', 'The member totals deleted']],
  ['Tap "Show again"', ['Toast "<name> is on the leaderboard again."'], ['The member staying hidden after a reload']],
], ['E-gym-member-board'], ['E-gym-member-board', 'E-gym-member-days'], []);
J(f, r, 3, 'Challenges, the "New challenge" sheet', [
  ['Leave the Name empty and tap "Start challenge"', ['"Give the challenge a name, like “November challenge”."'], ['A save with no name']],
  ['Type a name, a goal of 0, then 5 in "How many days"', ['"Type the goal as a number above 0.", then "It must run from 7 to 31 days."'], ['A challenge saved with a goal nobody can count or reach']],
  ['Pick "Visits", type a goal of 20 and 10 days', ['"The visits goal cannot be more than the number of days the challenge runs."'], ['A visits challenge that no member can win']],
  ['Pick days that another challenge already uses and save', ['"Another challenge already uses some of these days. Pick days that are free, or cancel the other challenge first."'], ['Two challenges on the same day', 'The typed boxes cleared after the refusal']],
], [], [CH], []);
J(f, r, 3, 'Challenges on a gym that is not online yet', [
  ['Open Challenges', ['"Challenges need your gym online" with "Members’ phones read the challenge from your gym’s server. Put your gym online first (Settings → Sign-in & data)."'], ['A "New challenge" button that saves nowhere', 'A raw error code']],
], [], [], []);
J(f, r, 6, 'Challenges, one challenge not started and one running', [
  ['Tap "Change" on the challenge that has not started, edit the goal, tap "Save changes"', ['The sheet "Change the challenge", then the new goal on the card'], ['A second challenge made in place of the change']],
  ['Tap "Cancel challenge" on the running one', ['"Cancel this challenge?" with "“<title>” will disappear from members’ phones. Nobody gets free days for it. This cannot be undone, but you can start a new one."', 'Buttons "Keep it" and "Cancel challenge"'], ['A cancel with no question first']],
  ['Tap "Cancel challenge"', ['Toast "Challenge cancelled. Members no longer see it."', 'The challenge under "Past challenges" as "Cancelled"'], ['Free days given for a cancelled challenge', 'The challenge still on member phones after 10 minutes']],
], [CH], [CH], ['P-A7-panel-1-61']);
J(f, r, 6, 'Challenges, a finished challenge with 3 winners waiting for the owner', [
  ['Open the finished challenge under "Past challenges"', ['"3 reached the goal, 3 waiting for the owner"', 'Each winner with "Won 7 free days. Waiting for the owner." and the buttons "Give 7 free days" and "Skip"', 'The note about checking a surprising number with the member before giving free days'], ['Free days already added before the owner tapped Give']],
  ['Tap "Give 7 free days" on one winner', ['"Saving…", then the toast "7 free days added for <name>. Plan now ends <day>."'], ['The days added twice after a double tap', 'A plan end date that did not move by 7 days']],
  ['Tap "Skip" on the second and "Give all 1 their free days" for the rest', ['"Skipped. <name> gets no free days." and the line "Skipped"', 'A winner with no running plan shows "Give by hand: 7 free days. No active membership."'], ['A skipped winner getting days later', 'A winner who left the gym getting days']],
], [HIT, C], [CH, HIT], ['P-A7-panel-2-20']);
J(f, r, 12, 'Challenges, a finished challenge with winners', [
  ['Tap "Copy this list"', ['Toast "List copied. You can paste it into WhatsApp."', 'The copied text holds the title, the days, the goal and each winner with name, phone number and result'], ['Winners of another gym or branch in the text', 'The list sent anywhere by itself']],
  ['Open Challenges on a front desk (staff) login', ['"Only the owner can start, change or cancel a challenge. You can see who has reached the goal."', 'No Give, Skip, Change or Cancel buttons'], ['Staff able to add free days to a plan from here']],
], [], [CH, HIT], ['P-A7-help-1-27']);
Y(f, r, 4, ['T4-zero', 'T4-one', 'T4-long', 'T4-hinglish', 'T4-emoji', 'T4-many'], 3, CH, 'A 60-letter or emoji name is read on member phones; "1 member took part" wording; many winners in Give all');
Y(f, r, 5, ['T5-midnight', 'T5-zone', 'T5-month1'], 3, CH, 'First day must be today in India; the last day is first day plus days minus 1');
Y(f, r, 7, ['T7-doubletap', 'T7-offline', 'T7-back', 'T7-twostaff'], 3, CH, 'Give all runs one call per winner: a drop mid-way leaves some given and some waiting');
Y(f, r, 8, ['T8-language'], 3, CH, 'The preview and winner lines must be in Hinglish when the panel is');
Y(f, r, 9, ['T9-360', 'T9-bigfont', 'T9-hinglish', 'T9-laptop'], 2, CH, 'Winner rows carry two buttons each; the form is a sheet with six boxes');
Y(f, r, 10, ['T10-olddata'], 1, HIT, 'Winners kept before free days were added by the server still get the by-hand line');
Y(f, r, 11, ['T11-apppanel', 'T11-twopanels'], 3, CH, 'Members must see the challenge within 10 minutes and the free days on their plan');
// ---------- F-panel-618
f = 'F-panel-618';
for (const role of ['owner', 'staff']) {
  const owner = role === 'owner';
  J(f, role, 1, 'A member page; the member shows the code from "Show my workouts to the desk" on their phone', [
    ['Tap "Check workout code"', ['Sheet "Check workout code" with "For the workout offer. The member opens “Show my workouts to the desk” in the app. Type the code from their phone."', 'A box "Workout code" with the example K3Q9P-X2M7A; "Check" is greyed until something is typed'], ['A code box already filled with an old code']],
    ['Type the 10 letters and numbers (small letters, with or without the dash) and tap "Check"', ['"8 of 9 workouts match a check-in (6 at the desk, 2 in the app)."', '"Code made on <day>."', 'Each workout day with "✓ Checked in at the desk", "✓ Checked in on the app", "✓ Checked in at the entry machine" or "No check-in: does not count"'], ['A workout day counted with no check-in on that day', 'A day after today in the list', 'An entry-machine check-in called "imported" in the summary line']],
    owner
      ? ['Tap "Give extra days"', ['The extra-days step for this member opens'], ['Days added with no further step', 'The button shown when no day matched']]
      : ['Read the line under the days', ['"The owner gives the extra days." where the desk may not add days'], ['Staff adding free days without the right to']],
  ], [], [C, 'E-gym-offers'], ['P-A7-whats-new-3-19']);
  N(f, role, 2, 'one way in only: the "Check workout code" button on a member page, and one kind of code');
  J(f, role, 3, 'The "Check workout code" sheet on a member page', [
    ['Type 6 letters and tap "Check"', ['"A workout code has 10 letters and numbers, like K3Q9P-X2M7A." under the box'], ['A result list for a short code']],
    ['Type 10 letters with one changed', ['"That code has a typing mistake. Check it against the member’s phone."'], ['A made-up code read as real workout days']],
    ['Type a code with the letter U in it', ['"That code has a letter a workout code never uses. Check it against the member’s phone."'], ['The sheet closing or crashing']],
  ], [], [], []);
  J(f, role, 6, 'The sheet showing a result for one code', [
    ['Change one letter in the box', ['The old result disappears at once until "Check" is tapped again'], ['The result of the first code left under a different code']],
    ['Type a code the member made 5 days ago and tap "Check"', ['"Code made on <day>. It is more than 3 days old: ask for a new code to see the newest workouts."'], ['An old code shown as fresh']],
    ['Type a code from a member with no workouts in 30 days', ['"This code has no workouts in its 30 days."'], ['"0 of 0 workouts match" or a give button']],
    ['Tap "Close" and open the sheet again', ['An empty box: nothing was saved'], ['The code kept anywhere after closing']],
  ], [], [C], []);
  J(f, role, 12, 'A member page; a code that belongs to a different member', [
    ['Type the other member code and tap "Check"', ['Only the days on which THIS member checked in count; the rest read "No check-in: does not count"'], ['The other member name, plan or anything else about them shown', 'The code or its days sent to a server or saved on the member']],
  ], [], [C], ['P-A7-whats-new-3-19']);
  Y(f, role, 4, ['T4-zero', 'T4-one', 'T4-many'], 2, C, 'No workouts in the code; "1 workout matches" singular; 30 workout days is the longest list');
  Y(f, role, 5, ['T5-midnight', 'T5-zone'], 2, C, 'The code holds its making day as a remainder: a phone clock a day ahead or a code typed after midnight must still read the right days');
  Y(f, role, 7, ['T7-back', 'T7-doubletap'], 2, 'none', 'Check works on the device; back must only close the sheet');
  N(f, role, 8, 'no setting changes the check: the sheet words are plain English and no alert or permission is used');
  Y(f, role, 9, ['T9-360', 'T9-bigfont', 'T9-laptop'], 2, 'none', 'Each day row has a date on the left and a long check-in line on the right');
  Y(f, role, 10, ['T10-olddata'], 2, 'none', 'A code made by an older member app must still read in the new panel, and the other way round');
  Y(f, role, 11, ['T11-apppanel'], 2, C, 'The days in the code are the days the member app counted; the panel matches them to its own register');
}
flush();
