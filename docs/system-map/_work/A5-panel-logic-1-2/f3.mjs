import { J, Y, N, flush } from './gen.mjs';
const C = 'E-crm-records';
// ---------- F-panel-619
let f = 'F-panel-619';
// owner
J(f, 'owner', 1, 'Money, a gym with receipts this month by cash and UPI and some unpaid plans', [
  ['Open Money', ['Page "Money" with "Every rupee that came in" and the tabs "Collections" and "Dues"', 'A "Period" row: "Today", "Last 7 days", "This month", "Last month", "This financial year", "Custom"'], ['A period that shows receipts dated outside it']],
  ['Pick "This month"', ['"How it came in" with one line per payment method and its amount', 'The receipts list for the month, with the filters "All methods" and "Everyone"'], ['A cancelled receipt inside the collected total', 'The methods not adding up to the total', 'A summary that counts other receipts than the list shows']],
  ['Tap "Dues"', ['"All money still due to the gym"', 'Tiles "Total due", "Over 60 days", "31–60 days", "Up to 30 days", "Not started yet", each with an amount', '"Who has dues" with "Filter by how long it is due", each member with "Collect"'], ['A plan that starts in the future shown as overdue', 'An archived member who owes money missing from the total', 'A cancelled plan chased as a due']],
  ['Tap "Download Excel file" on "Who has dues"', ['A file <gym>-dues-<today>.csv with only the rows on screen', 'Toast "Exported <n> dues." (or "Exported 1 due.")'], ['A file with more rows than the filtered list', 'Amounts in paise instead of rupees']],
], [], [C], ['P-A7-panel-1-05']);
J(f, 'owner', 2, 'A link straight to the Dues tab (/money/dues), for example from a dues number on Today', [
  ['Open the link', ['Money opens on "Dues", not on "Collections"'], ['The Collections tab shown first', 'A blank page']],
  ['Tap "Collect" on a member', ['The collect-fees sheet for that member; if the member cannot be opened: "That member could not be opened. Try reloading the page."'], ['The sheet of another member', 'An amount of zero when dues exist']],
], [C], [C], []);
J(f, 'owner', 3, 'Money on a new gym with no payments and no unpaid plans', [
  ['Open Money, any period', ['"Nothing collected in this period" and "No receipts here"', '"Download Excel file" is greyed out'], ['NaN or "₹NaN" as an average or largest receipt', 'A download of an empty file']],
  ['Tap "Dues"', ['"No dues" with "Every membership is fully paid." and the button "Open Members"'], ['Empty age tiles with a download button']],
  ['Pick "Custom" and set the from-day after the to-day', ['The two days are read the right way round, or a plain message'], ['A crash or a minus total']],
], [], [C], []);
J(f, 'owner', 6, 'Money, This month, with one receipt just taken', [
  ['Cancel that receipt from its receipt page, then open Money again', ['The collected total and its method line are lower by that amount; the cancelled money is shown apart'], ['The cancelled receipt still in the total', 'The receipt gone with no trace']],
  ['Open "Dues"', ['The member owes that amount again, in the age group of the plan start day'], ['The member still shown as paid']],
  ['Archive that member, open "Dues" again', ['The member is still in the list and in "Total due"'], ['The dues total dropping because a member was archived']],
], [C], [C], []);
J(f, 'owner', 12, 'Money on the owner login; then the same gym on a front desk (staff) login', [
  ['As owner, filter receipts by "Everyone" then by one staff name', ['Only receipts taken by that person, and a summary for the same receipts'], ['Receipts of another gym or branch']],
  ['As staff, open Money', ['Only "Dues", titled "Who still has fees to pay", with no tabs'], ['The Collections tab, "Total due", the age tiles or "Download Excel file" shown to staff']],
], [], [C], ['P-A7-panel-1-05', 'P-A7-panel-2-50']);
Y(f, 'owner', 4, ['T4-zero', 'T4-one', 'T4-many', 'T4-partpaid', 'T4-refund', 'T4-zeroprice', 'T4-planedge', 'T4-long'], 2, C, 'Part-paid plans are the dues; a cancelled receipt must leave Collected; a plan starting today is 0 days due');
Y(f, 'owner', 5, ['T5-midnight', 'T5-month1', 'T5-zone'], 2, C, 'Periods are India days; "This financial year" turns on 1 April; age groups turn at 30 and 60 days');
Y(f, 'owner', 7, ['T7-doubletap', 'T7-offline', 'T7-twostaff'], 4, C, 'Download needs the internet though the file is made on the device; a fee taken on another device changes both tabs');
N(f, 'owner', 8, 'no setting changes these lists: the Money words are plain English and nothing here sends an alert');
Y(f, 'owner', 9, ['T9-360', 'T9-laptop', 'T9-bigfont', 'T9-dark'], 2, C, 'Five money tiles and a wide receipts list');
Y(f, 'owner', 10, ['T10-olddata'], 2, C, 'Receipts with a payment method the new version does not list still get a line');
Y(f, 'owner', 11, ['T11-twopanels'], 2, C, 'A receipt taken on the desk phone must be in the owner laptop total after a refresh');
// staff
J(f, 'staff', 1, 'Money on a front desk (staff) login, with members who owe fees', [
  ['Open Money', ['Page "Money" with "Who still has fees to pay"', '"Who has dues" with "Filter by how long it is due" and each member with what they owe and "Collect"'], ['Any gym-wide total', 'The Collections tab']],
  ['Tap "Collect" on a member and take the fee', ['The collect sheet for that member; after saving, the member leaves the list or shows the smaller amount'], ['The member still listed with the old amount', 'The receipt saved without the name of who took it']],
], [C], [C], ['P-A7-panel-2-50']);
J(f, 'staff', 2, 'A link to the Collections tab (/money/collections) opened on a staff login', [
  ['Open the link', ['The Dues list, as from the menu'], ['The collections report shown for a moment before it changes', 'An error page']],
], [], [C], ['P-A7-panel-2-50']);
J(f, 'staff', 3, 'Money on a staff login when nobody owes anything', [
  ['Open Money', ['"No dues" with "Every membership is fully paid." and "Open Members"'], ['A blank page', 'A money total of zero shown as a tile']],
  ['Pick an age filter with nobody in it (when some dues exist)', ['"Nothing in this age group"'], ['The list of another age group']],
], [], [C], []);
J(f, 'staff', 6, 'Money on a staff login, a member with a part-paid plan', [
  ['Collect part of what is owed', ['The member stays in the list with the smaller amount'], ['The member gone though money is still owed']],
  ['Collect the rest', ['The member leaves the list'], ['The member listed with "₹0"']],
  ['Look for a way to cancel the receipt just taken', ['No cancel for staff: only the owner cancels receipts'], ['Staff able to undo money']],
], [C], [C], []);
J(f, 'staff', 12, 'Money on a staff login', [
  ['Read the whole page', ['Names and what each member owes'], ['"Total due", the age tiles with amounts, "Download Excel file" or any figure of all money collected']],
], [], [C], ['P-A7-panel-1-05', 'P-A7-panel-2-50']);
Y(f, 'staff', 4, ['T4-zero', 'T4-many', 'T4-partpaid', 'T4-long', 'T4-planedge'], 1, C, 'The same dues list as the owner without the totals');
Y(f, 'staff', 5, ['T5-midnight', 'T5-zone'], 1, C, 'Days due are counted from the plan start to today in India');
Y(f, 'staff', 7, ['T7-twostaff', 'T7-offline', 'T7-doubletap'], 2, C, 'Two desks collecting from the same member must not both take the full amount');
N(f, 'staff', 8, 'no setting changes the dues list: plain English words and no alert');
Y(f, 'staff', 9, ['T9-360', 'T9-bigfont'], 1, C, 'The desk uses this list on a phone');
N(f, 'staff', 10, 'the list is worked out again from plans and receipts on every open; nothing of its own is stored');
Y(f, 'staff', 11, ['T11-twopanels'], 2, C, 'A fee collected on the desk phone must show on the owner laptop');
// ---------- F-panel-620
f = 'F-panel-620';
J(f, 'owner', 1, 'Money, Collections, This month, with receipts on screen', [
  ['Tap "Download Excel file"', ['A file <gym>-collections-<from>-<to>.csv is saved', 'Toast "Exported <n> receipts." (or "Exported 1 receipt.")'], ['No file and no message', 'A toast with a different count than the file has rows']],
  ['Open the file in Excel', ['Columns "Receipt no", "Date", "Member", "Mobile", "Membership", "Method", "Reference", "Amount (INR)", "Cancelled amount (INR)", "Status", "Taken by"', 'Hindi names and the rupee sign read correctly', 'The Amount column adds up to the collected total on screen'], ['Boxes or question marks in place of Hindi letters', 'A mobile number turned into 9.88E+09', 'A cancelled receipt inside the Amount total']],
], [], [C], []);
J(f, 'owner', 2, 'Other reports with the same button: Your growth, Dues, Attendance, pass visits', [
  ['Open "Your growth" and tap "Download Excel file"', ['<gym>-growth-<today>.csv and the toast "Downloaded <n> months."'], ['A month with unknown renewals shown as a firm renewal rate in the file while the page shows "–"']],
  ['Open Money, "Dues", filter to one age group, tap "Download Excel file"', ['Only the rows on screen in the file; toast "Exported <n> dues."'], ['All dues exported from a filtered list']],
], [], [C], []);
J(f, 'owner', 3, 'A member whose name was typed as =HYPERLINK("http://x","Pay here"), with a receipt', [
  ['Download the collections file and open it in Excel', ['The name cell shows the typed text starting with an apostrophe guard, as plain text'], ['A live link or formula in the cell', 'Excel asking to run or update something']],
  ['Filter the receipts list to nothing', ['"Download Excel file" is greyed out'], ['An empty file saved']],
  ['Turn the internet off and look at the button', ['The button cannot be used and says why'], ['A tap that does nothing with no word']],
], [], [C], []);
J(f, 'owner', 6, 'Money, Collections, a list filtered by one payment method', [
  ['Download, then clear the filter and download again', ['Two files: the first with only that method, the second with all; each toast gives its own count'], ['The second file still filtered', 'The browser keeping only one of two files with the same name without saying so']],
], [], [C], []);
J(f, 'owner', 12, 'Any report file saved from the panel', [
  ['Open the saved file', ['Member names and mobile numbers of this gym only; the file now sits on the device, outside MettleUp'], ['Rows of another gym or branch', 'A gym name with Hindi letters turning the file name into just "export.csv" with no gym or date']],
], [], [C], ['P-A7-panel-1-05']);
Y(f, 'owner', 4, ['T4-zero', 'T4-many', 'T4-long', 'T4-hinglish', 'T4-emoji', 'T4-refund'], 1, C, 'Commas, quotes, line breaks, emoji and Devanagari in names and notes must stay in one cell');
Y(f, 'owner', 5, ['T5-midnight', 'T5-zone'], 1, C, 'The file name carries the India day and the period days');
Y(f, 'owner', 7, ['T7-doubletap', 'T7-offline'], 1, 'none', 'No busy state: two taps save two files');
N(f, 'owner', 8, 'no setting changes the file: headers are English and the format is fixed');
Y(f, 'owner', 9, ['T9-360', 'T9-laptop'], 1, 'none', 'On a phone the file goes to Downloads; the button sits in a section title row');
N(f, 'owner', 10, 'the file is made new on every tap; nothing saved by an old version is read');
N(f, 'owner', 11, 'the file is saved on the one device where the button was tapped');
J(f, 'staff', 1, 'Attendance on a front desk (staff) login, with a list on screen', [
  ['Tap "Download Excel file"', ['A .csv file named after the gym, the list and the day', 'A toast with the number of rows, like "Exported <n> members."'], ['A file with other rows than the list on screen']],
  ['Open it in Excel', ['Names in Hindi read correctly; a name that starts with =, +, - or @ opens as text'], ['A formula that runs', 'Boxes in place of letters']],
], [], [C], []);
N(f, 'staff', 2, 'staff reach the download only from the lists they may open; the money reports and their buttons are the owner own');
J(f, 'staff', 3, 'Money on a staff login, the Dues list', [
  ['Look for "Download Excel file" on "Who has dues"', ['No download button for staff'], ['Staff saving the whole dues list with amounts as a file']],
  ['Open Attendance with an empty list', ['"Download Excel file" is greyed out'], ['An empty file saved']],
], [], [C], ['P-A7-panel-2-50']);
J(f, 'staff', 6, 'Attendance on a staff login', [
  ['Change the filter, then tap "Download Excel file"', ['The file holds the filtered rows; the toast count matches'], ['The file made from the list as it was before the filter']],
], [], [C], []);
J(f, 'staff', 12, 'A file saved by staff', [
  ['Open the file', ['Member names and mobile numbers of this gym; no money totals'], ['Money collected, dues totals or receipts in a staff file', 'Members of another gym']],
], [], [C], ['P-A7-panel-2-50']);
Y(f, 'staff', 4, ['T4-zero', 'T4-many', 'T4-long', 'T4-hinglish', 'T4-emoji'], 1, C, 'Same cell rules as for the owner');
Y(f, 'staff', 5, ['T5-midnight', 'T5-zone'], 1, C, 'The file name carries the India day');
Y(f, 'staff', 7, ['T7-doubletap', 'T7-offline'], 1, 'none', 'No busy state on the button');
N(f, 'staff', 8, 'no setting changes the file');
Y(f, 'staff', 9, ['T9-360'], 1, 'none', 'The desk phone must be able to reach the button and find the file');
N(f, 'staff', 10, 'the file is made new on every tap');
N(f, 'staff', 11, 'the file is saved on the one device where the button was tapped');
flush();
