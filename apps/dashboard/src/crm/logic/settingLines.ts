/**
 * R-561 (owner, 15 Nov 2026): every setting the owner is expected to change gets ONE plain, complete, simple sentence
 * under its label, saying what it does for the gym. The reader: an Indian gym owner or the front desk, on a phone or a
 * laptop, with English as a second language. One list, so the words stay one sentence each (test/crm/settingLines
 * checks: one sentence, a capital first, a full stop last, a Hinglish line in lang/hinglish.ts) and the whole list can
 * go to a second reader in one batch (the Gemini review, docs/CLAUDE-NOTES.md R-561).
 *
 * Drawn through t(), so a gym that picked Hinglish reads the Hinglish line. `{n}`: a number the screen fills in.
 * The facts behind each line are in the comment beside it. PURE.
 */

export const SETTING_LINES = {
  // Settings -> Gym details. The name is on the member app (gym header) and on every receipt (receiptDoc gymName).
  gymName: 'This name shows in your members’ MettleUp app and on your receipts.',
  branchName: 'Members of this branch see this name in their MettleUp app and on its receipts.',
  // receiptDoc gymPhone; the web page's Call button reads the same number (gympage preview pagePhone).
  phone: 'This number is printed on your receipts, and your web page can show it with a Call button.',
  // receiptDoc: the GSTIN prints only when GST applies to it (gstAppliesTo).
  gstin: 'If your gym is registered for GST, this number shows on your receipts.',
  gstinBranch: 'If this branch is registered for GST, this number shows on its receipts.',
  // receiptDoc gymAddress; the web page's "Also on your page" lists the same address.
  address: 'This address shows on your receipts and on your web page.',
  // logic/upiPay: the reminders, renewal messages and receipts carry the UPI ID and a upi:// pay link with the amount.
  upiId: 'Fee reminders, renewal messages and receipts show this UPI ID with a link that opens the member’s UPI app with the amount already filled in.',

  // Payments: the two switches (pay/PaymentsScreen). Off: the member still sees what they owe and pays at the desk.
  payInApp: 'Tick this box to show members a Pay now button in the MettleUp app for what they owe, or leave it unticked so that they pay at the desk.',
  payOnJoin: 'Tick this box to let people who join with your join link pay for their plan online, or leave it unticked so that they pay at the desk.',

  // Branches: the business name heads All branches; members see each branch's own name.
  businessName: 'This name shows at the top of the All branches screen, but members still see each branch’s own name.',

  // Branding: the look of the member app (BrandingScreen header; apps/mobile theme/gymTheme.ts).
  brandColour: 'Your members’ MettleUp app uses this colour for its buttons, highlights and charts.',
  brandBackground: 'Your members’ MettleUp app uses this dark colour for its pages and makes the cards a little lighter.',

  // Member app -> Busy machines: one line on the Gym tab (ui/screens/BusyMachines).
  busyMachines: 'Tick this box to show members one tip on the Gym tab of their app, for example “Leg day is quieter on Tuesday”.',
  // Member app -> Plus lock (logic/plusLock, 0070): the paid features lock {n} days after the plan ends; workouts stay.
  plusLock: 'Tick this box to stop the paid features {n} days after a member’s plan ends until they renew, while their workouts are always kept.',
  // Member app -> Bring a friend (logic/referrals): the days are given by the desk with one tap, never by themselves.
  friendDays: 'Type how many free days you give, with one tap, to each friend who joins through a member’s invite link, or leave it empty to give none.',

  // Gym timings: the note under the timings (GymTimings NOTE_LIMIT 120).
  timingsNote: 'Type up to 120 letters here to tell members something they should know about your gym timings.',

  // Web page (ui/screens/WebPage): the address, the Maps link, WhatsApp, publishing and Google.
  pageAddress: 'This is your web page’s address, made from your gym’s name and area, and you can change it until the page is published.',
  mapsLink: 'Paste your gym’s Google Maps link here by tapping Share and then Copy link in Maps, so that visitors find the right place.',
  whatsapp: 'Tick this box to let people message your gym on WhatsApp from your web page.',
  publish: 'Tick this box to let anyone with the link see your web page, and untick it at any time to hide the page.',
  indexable: 'Tick this box so that Google may show your web page in search results, or leave it unticked so that only people with the link find it.',

  // Entry machines: where the serial number is printed (EntryMachines; the error says the same).
  serial: 'You find this number on the machine under Menu > System Info > Serial Number.',
} as const;

export type SettingLineId = keyof typeof SETTING_LINES;
