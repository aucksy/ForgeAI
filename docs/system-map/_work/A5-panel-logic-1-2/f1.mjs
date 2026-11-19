import { J, Y, N, flush } from './gen.mjs';
const C = 'E-crm-records';
// ---------- F-panel-614 owner
let f = 'F-panel-614';
const r = 'owner';
J(f, r, 1, 'More, a gym with a year of members, fees and check-ins on record', [
  ['Open More and tap "Your growth"', ['Page titled "Your growth" with "Is your gym growing? Month by month, before and since MettleUp."', 'A summary that starts "Since you started MettleUp in <month>, compared with the months before:" with lines such as "Money collected: up 18% a month"', 'The line "Started on MettleUp: <day>. These numbers show what changed since you started, not why."'], ['A summary line with only one side of the comparison', 'A cancelled receipt counted in Money collected']],
  ['Read the six cards', ['"Money collected", "Active members", "New members", "Renewal rate", "Members lost", "Visits per member", each with "Before MettleUp" and "Since MettleUp"', 'A month whose 15 renewal days are not over shows "–" for Renewal rate and Members lost'], ['A "100%" renewal rate made from the few plans decided so far', 'This month so far counted as a full month in an average']],
  ['Tap "Download Excel file"', ['A file named <gym>-growth-<today>.csv is saved', 'Toast "Downloaded 12 months." (or "Downloaded 1 month.")'], ['A file that shows different figures from the page', 'Hindi or rupee letters shown as boxes in Excel']],
], [], [C], ['P-A7-whats-new-1-88']);
J(f, r, 2, 'What is new list in the panel, the "Your growth" entry', [
  ['Tap "Open Your growth"', ['The same "Your growth" page as from More'], ['A blank page or the Today screen']],
  ['Tap "Share this report"', ['A page titled "Share this report" with "One page to print, or to save as a PDF and send."', 'The button "Print or save as PDF" and a way back'], ['Figures on the print page that differ from the main page']],
  ['Tap "Print or save as PDF"', ['The browser print window with the report on one page'], ['Menus or buttons printed on the page', 'The report cut off at the right edge']],
], [], [C], ['P-A7-whats-new-1-88']);
J(f, r, 3, 'A gym that started on MettleUp this month, with no old records', [
  ['Open "Your growth"', ['"You started MettleUp in <month>."', '"Your first comparison shows after <day>, once you have 2 full months on MettleUp."', 'A card "To compare with before MettleUp, add your old records" with the button "Add old records"', '"The charts start once your gym has two months on record. This month so far is below."'], ['Six empty charts', 'NaN, Infinity or "0%" shown as a change', 'An error screen']],
  ['Tap "Add old records"', ['The import screen for an Excel or CSV file'], ['A dead button']],
], [], [C], []);
J(f, r, 6, 'Your growth, first shown without old records (first months against latest months)', [
  ['Look at the summary', ['"Your latest 3 months on MettleUp, compared with your first 3 months:" and sides named "First months" and "Latest months"'], ['The words "Before MettleUp" when no month before the start is on record']],
  ['Add old member and fee records through "Add old records", then open "Your growth" again', ['The summary changes to "Since you started MettleUp in <month>, compared with the months before:"', 'The card "To compare with before MettleUp, add your old records" is gone once 2 months before the start are on record'], ['The old comparison still shown after the import', 'Old months counted as "Since MettleUp"']],
  ['Cancel a receipt of last month in Money, then open "Your growth" again', ['Money collected for last month is lower by that receipt'], ['The cancelled money still inside the month total']],
], [C], [C], []);
J(f, r, 12, 'A second login on the same gym that is front desk (staff), to check what the owner page gives away', [
  ['Open More', ['No "Your growth" line in the list'], ['The staff login seeing the gym money month by month']],
  ['Type the address of the page (/growth) by hand', ['The owner-only screen with the button "Back to Today"'], ['Any month figure, chart or the download button shown to staff']],
], [], [], ['P-A7-whats-new-1-88', 'P-A7-panel-1-05']);
Y(f, r, 4, ['T4-zero', 'T4-one', 'T4-refund', 'T4-planedge', 'T4-many'], 1, C, 'One month on record hides the charts; a cancelled receipt must leave the month; a plan ending on the last day of a month decides which month it is lost in');
Y(f, r, 5, ['T5-month1', 'T5-midnight', 'T5-zone'], 1, C, 'Month ends and the 15-day renewal window decide every figure; today must be the India day');
Y(f, r, 7, ['T7-doubletap', 'T7-offline'], 3, C, 'Download has no busy state: two taps can save two files; the page is worked out on the device');
Y(f, r, 8, ['T8-language'], 1, C, 'The page words are plain English strings, not passed through the Hinglish table');
Y(f, r, 9, ['T9-360', 'T9-laptop', 'T9-dark', 'T9-bigfont'], 2, C, 'Six chart cards and a wide month table that scrolls sideways inside its box');
Y(f, r, 10, ['T10-olddata'], 1, C, 'Records imported by an older version must land in the right months');
Y(f, r, 11, ['T11-twopanels'], 1, C, 'A payment taken on the desk phone must reach the owner laptop figures after a refresh');
// ---------- F-panel-616
f = 'F-panel-616';
for (const role of ['owner', 'staff']) {
  const owner = role === 'owner';
  J(f, role, 1, 'Today, after a member whose plan ended on 1 Nov and who owes fees checked in today', [
    ['Open Today', ['A card "Came in today with an ended plan or fees due"', '"They checked in today. Ask them to renew or pay before they leave."', 'The member name with "Plan ended 1 Nov" and "<amount> due"'], ['A member with a running plan and no dues in the card', 'The same member twice after two check-ins today', 'A pass member listed as having no plan']],
    ['Tap "Message" on the row', ['The WhatsApp message sheet for that member, opened on the fees message because money is owed'], ['A message sent without the user pressing send', 'The plan-ended message chosen when fees are owed']],
  ], [], [C], []);
  J(f, role, 2, 'Today, the card "Came in today with an ended plan or fees due" with 7 people in it', [
    ['Tap a member name', ['That member page'], ['Another member page']],
    ['Go back and tap "2 more in the register."', ['The attendance register'], ['More or fewer than 5 rows shown above the "more" line', 'The link missing when more than 5 people are in the list']],
  ], [], [C], []);
  J(f, role, 3, 'Today, when everyone who checked in today has a running plan and no dues', [
    ['Open Today', ['No "Came in today with an ended plan or fees due" card at all'], ['An empty card with a title and no rows', 'A member listed because of a visit on another day']],
    ['A member who never bought a plan checks in at the desk', ['The card appears with "No plan bought" under the name'], ['"Plan ended" with no date', 'An amount of "₹0 due"']],
  ], [C], [C], []);
  J(f, role, 6, 'Today, a member listed with "Plan ended <date>" and "<amount> due"', [
    ['Open the member, sell a new plan and collect the full fee', ['The sale and the receipt are saved'], ['The save refused because the plan had ended']],
    ['Go back to Today', ['The member is no longer in the card; with nobody left the card is gone'], ['The member still listed after paying in full', 'The card kept from the check-ins of yesterday']],
  ], [C], [C], []);
  J(f, role, 12, owner ? 'Today on the owner login' : 'Today on a front desk (staff) login', [
    ['Read the card', [owner ? 'Each member own amount due' : 'Each member own amount due, which the desk needs to ask for it'], [owner ? 'A member of another branch or gym in the list' : 'A gym-wide money total shown to staff through this card', 'A member of another gym in the list']],
  ], [], [C], owner ? [] : ['P-A7-panel-2-50']);
  Y(f, role, 4, ['T4-zero', 'T4-many', 'T4-partpaid', 'T4-long', 'T4-nophoto'], 1, C, 'Only 5 rows show; a part-paid member must show what is left; initials stand in for a photo');
  Y(f, role, 5, ['T5-midnight', 'T5-endstoday', 'T5-zone'], 1, C, 'The list is today in India; a plan that ends today still covers today');
  Y(f, role, 7, ['T7-twostaff', 'T7-offline'], 1, C, 'A check-in made on another desk device must reach this card');
  Y(f, role, 8, ['T8-language'], 1, C, 'The card words go through the Hinglish table');
  Y(f, role, 9, ['T9-360', 'T9-bigfont', 'T9-hinglish'], 1, C, 'Name, detail line and Message button share one row that does not wrap');
  N(f, role, 10, 'nothing is saved by this card: it is worked out again from visits and dues on every open');
  Y(f, role, 11, ['T11-twopanels', 'T11-apppanel'], 1, C, 'A QR check-in from the member app on an ended plan must show here');
}
flush();
