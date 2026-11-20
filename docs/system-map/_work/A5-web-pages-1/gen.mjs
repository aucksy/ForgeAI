// Scratch generator for A5-web-pages-1 rows. Writes docs/system-map/_work/out/A5-web-pages-1.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'out', 'A5-web-pages-1.jsonl');
const rows = [];
const counters = {};
const ids = {};
const slug = (r) => r.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const s = (action, sees, mustNot) => ({ action, user_sees: sees, must_not: mustNot });
function J(feature, role, type, start, steps, writes = [], reads = [], promise_ids = [], tag) {
  counters[feature] = (counters[feature] || 0) + 1;
  const id = `J-${feature}-${String(counters[feature]).padStart(2, '0')}`;
  if (tag) ids[tag] = id;
  rows.push({ kind: 'journey', id, feature, role, type, generated: false, start, steps: steps.map((x, i) => ({ n: i + 1, ...x })), writes, reads, promise_ids, tests: [], coverage: 'unknown', last_result: null });
}
function T(feature, role, type, variants, at_step, entity, note) {
  rows.push({ kind: 'jtype', id: `JT-${feature}-${slug(role)}-${type}`, feature, role, type, applies: 'yes', why_not: 'none', variants, at_step, entity, note });
}
function N(feature, role, type, why) {
  rows.push({ kind: 'jtype', id: `JT-${feature}-${slug(role)}-${type}`, feature, role, type, applies: 'no', why_not: why, variants: [], at_step: 0, entity: 'none', note: 'none' });
}

// ============================================================ F-web-139 legal pages
{
  const F = 'F-web-139';
  const nav = 'Top line of links: Privacy notice · Terms · Data agreement · Refunds · Shipping and delivery · Contact · About · Delete your account';
  const pages = {
    prospect: { p: '/refund.html', t: 'MettleUp refunds and cancellation', h: ['1. The free trial', '2. We never charge you automatically', '3. Payments are not refunded'], pr: ['P-A7-legal-2-74', 'P-A7-legal-2-75', 'P-A7-legal-2-77', 'P-A7-legal-2-79', 'P-A7-legal-2-80'], from: 'The gym-owner site gyms.mettleup.fit, footer link Refunds', alt: ['/delivery.html', 'MettleUp shipping and delivery', 'When you get access', ['P-A7-pilot-46', 'P-A7-pilot-47', 'P-A7-pilot-48']] },
    owner: { p: '/data-agreement.html', t: 'MettleUp data agreement for gyms', h: ['1. Your records are yours', '4. Security', '9. Deleting your gym'], pr: ['P-A7-pilot-01', 'P-A7-pilot-03', 'P-A7-pilot-08', 'P-A7-pilot-23'], from: 'Admin app, the terms and data agreement accept card, link Data agreement', alt: ['/terms.html', 'MettleUp terms of use', 'B. For gyms (the admin app)', ['P-A7-legal-3-16', 'P-A7-legal-3-17', 'P-A7-legal-3-22']] },
    staff: { p: '/terms.html', t: 'MettleUp terms of use', h: ['In short', 'B. For gyms (the admin app)'], pr: ['P-A7-legal-3-22'], from: 'Admin app, Settings, link Terms', alt: ['/contact.html', 'Contact MettleUp', 'Complaints', []] },
    trainer: { p: '/privacy.html', t: 'MettleUp privacy notice', h: ['In short', '4. What we collect, and why', '6. How long we keep it'], pr: ['P-A7-legal-2-02', 'P-A7-legal-2-14'], from: 'Admin app, Settings, link Privacy notice', alt: ['/about.html', 'About MettleUp', 'Our promises to gyms', ['P-A7-websites-1-11']] },
    member: { p: '/delete-account.html', t: 'Delete your MettleUp account', h: ['Delete it in the app', 'No app any more? Email us', 'What we delete', 'What is kept, and for how long'], pr: ['P-A7-pilot-33', 'P-A7-pilot-35', 'P-A7-pilot-36', 'P-A7-pilot-37', 'P-A7-pilot-38', 'P-A7-pilot-41'], from: 'Google Play listing, link Delete account', alt: ['/privacy.html', 'MettleUp privacy notice', '7. Delete your data', ['P-A7-legal-2-36', 'P-A7-legal-2-37']] },
  };
  for (const role of ['prospect', 'owner', 'staff', 'trainer', 'member']) {
    const g = pages[role];
    J(F, role, 1, g.from, [
      s(`Tap the link; the page ${g.p} opens`, [`Heading '${g.t}'`, ...g.h.map((h) => `Section '${h}'`), nav], ['A blank page or the admin app opening instead of the page', 'A section heading with no text under it']),
      s('Scroll to the bottom', ['A line starting \'Last updated:\'', 'The email contact@mettleup.fit as a link'], ['The page cut off before the Last updated line', 'An email address that cannot be tapped']),
    ], [], [], g.pr);
    J(F, role, 2, `On ${g.p}, the top line of links`, [
      s(`Tap the link to ${g.alt[0]} in the top line`, [`Heading '${g.alt[1]}'`, `Section '${g.alt[2]}'`, nav], ['The link opening the admin app or the member site', 'A different page from the one tapped']),
      s('Type the same address without .html (for example mettleup.fit/privacy)', ['The same page'], ['A redirect to app.mettleup.fit', 'A Not found answer']),
    ], [], [], g.alt[3]);
    J(F, role, 3, 'A browser, a wrong page address on mettleup.fit', [
      s('Open mettleup.fit/refunds (a wrong name, with an s)', ['The address moves to app.mettleup.fit/refunds and the admin app opens'], ['A legal page shown with someone else\'s content', 'An endless loop of redirects']),
      s('Open mettleup.fit/refund instead', ['Heading \'MettleUp refunds and cancellation\''], ['The admin app instead of the page']),
    ]);
    J(F, role, 6, `${g.p} was changed after the role last read it`, [
      s(`Open ${g.p} again on the same phone where the admin app is installed`, ['The new text and the new \'Last updated\' date'], ['The old version of the page kept on the phone (the admin app\'s offline keeper must skip these pages)', 'Two different dates on the same page']),
    ], [], [], g.pr.slice(0, 1));
    const privacy = role === 'member'
      ? [s('Read \'What is kept, and for how long\'', ['\'Backup copies: we remove every backup copy of your data within 7 days of deletion.\'', 'Gym records stay with the gym; leaving the gym erases the mobile number'], ['A promise here that differs from privacy notice section 7', 'Any member name or gym data shown on the public page'])]
      : [s(`Read ${role === 'prospect' ? 'the refund page' : 'the page'} as anyone on the internet can`, ['General words only; no gym, member or staff name, no number'], ['Any gym or person\'s data on a public page', 'A sign-in asked before the page can be read'])];
    J(F, role, 12, `Anyone, signed in or not, opens ${g.p}`, privacy, [], [], role === 'member' ? ['P-A7-pilot-41', 'P-A7-pilot-43', 'P-A7-legal-2-37'] : role === 'owner' ? ['P-A7-pilot-03', 'P-A7-pilot-25'] : ['P-A7-pilot-81']);
    N(F, role, 4, 'static pages: they show the same fixed words for everyone and hold no stored data');
    N(F, role, 5, 'no time edge: the pages are fixed text; the Last updated dates are typed, not computed');
    T(F, role, 7, ['T7-offline'], 1, 'none', 'The admin app\'s offline keeper skips these pages on purpose, so with no internet they do not open from the installed app');
    if (role === 'prospect') N(F, role, 8, 'a prospect has no app settings; the pages follow only the device light or dark mode (type 9)');
    else T(F, role, 8, ['T8-language'], 1, 'none', 'The app set to Hinglish opens English pages; only the privacy notice has a Hindi part');
    T(F, role, 9, ['T9-360', 'T9-dark', 'T9-light'], 1, 'none', 'Pages have their own dark colours by the device setting; the long top line of links must wrap at 360 px');
    N(F, role, 10, 'nothing is saved on the device for these pages and they are served fresh, so an update has nothing old to carry');
    N(F, role, 11, 'read-only public pages; nothing to sync between devices');
  }
}

// ============================================================ F-web-138 service worker
{
  const F = 'F-web-138';
  for (const role of ['owner', 'staff', 'trainer']) {
    J(F, role, 1, 'Chrome on the desk phone, app.mettleup.fit signed in, internet on', [
      s('Open app.mettleup.fit and tap Install app in Chrome\'s menu', ['Chrome\'s Install app sheet with the MettleUp admin icon'], ['No install offer (the service worker did not take the page)']),
      s('Open the installed app once with internet', ['The admin app opens on the newest version'], ['An old version shown while the newest is online']),
      s('Turn internet off and open the installed app again', ['The admin app opens and shows the copy of the gym kept on this device'], ['Chrome\'s dinosaur page', 'A blank white screen', 'Old buttons from a previous deploy that no longer work']),
    ], [], ['E-crm-records'], ['P-A7-pilot-11']);
    J(F, role, 2, 'Alerts on for this browser, the admin app closed', [
      s('A member sends a complaint; the gym server sends an alert', ['A phone or computer notice, for example \'MettleUp: news from your members\''], ['The same alert shown twice (open page and closed app)', 'Another gym\'s alert']),
      s('Tap the notice', ['The admin app opens on that alert\'s page; an open tab is reused'], ['A second admin app tab when one is already open', 'A page outside the admin app']),
    ], [], ['E-gym-web-push', 'E-gym-alerts']);
    J(F, role, 2, 'Settings, Alerts from your members, this device signed up for alerts', [
      s('Tap Send a test alert', ['A test notice on this device', 'The alerts card says when it showed, for example \'It showed on this device at 7:41 pm\''], ['The card never saying it showed although the notice appeared', 'The test reaching another device']),
    ], ['E-gym-alerts'], ['E-gym-web-push'], ['P-A7-panel-2-60']);
    J(F, role, 3, 'A new phone that never opened the admin app, no internet', [
      s('Open app.mettleup.fit with no internet', ['The browser\'s own no-internet page'], ['A half-drawn admin app', 'A copy of another person\'s gym']),
      s('On the installed app with no internet, open a join link app.mettleup.fit/j/ABC123', ['The browser\'s no-internet page (join, check-in and legal pages are never kept)'], ['The admin app opening in place of the join page']),
    ], [], []);
    J(F, role, 6, 'The installed app used offline yesterday; a new version was deployed today', [
      s('Open the installed app with internet', ['The new version, without a reload by hand'], ['Yesterday\'s version kept on screen while online']),
      s('Turn internet off and open it again', ['Today\'s version from the device copy'], ['Files of the old version mixed in', 'A blank page because an old file was dropped']),
    ], [], ['E-crm-records']);
    J(F, role, 12, 'A shared desk computer with the installed admin app', [
      s('Sign out on the shared computer, then open the installed app with no internet', ['The sign-in screen; no gym copy'], ['The previous person\'s gym data shown offline', 'Members\' names readable without a sign-in']),
    ], [], ['E-crm-records'], ['P-A7-pilot-11', 'P-A7-legal-2-06']);
    N(F, role, 4, 'the service worker keeps only the page and its files, never gym rows; how many rows the copy holds belongs to the saved-copy feature');
    N(F, role, 5, 'no time edge in the service worker: nothing is dated or expires by time; it is network first on every open');
    T(F, role, 7, ['T7-offline', 'T7-closed'], 3, 'E-crm-records', 'Network fails mid-load: the kept page must be used; a closed app still gets alerts');
    T(F, role, 8, ['T8-permission', 'T8-alerts'], 1, 'E-gym-web-push', 'Notifications refused: no closed-app alerts; the card must say why');
    T(F, role, 9, ['T9-laptop', 'T9-360'], 1, 'none', 'Installed app on the desk laptop and on a phone');
    T(F, role, 10, ['T10-midway'], 2, 'none', 'A deploy while the app is open: the old page names old files that the keeper drops');
    T(F, role, 11, ['T11-twopanels'], 3, 'E-crm-records', 'Offline copy on the phone and on the laptop can show different old facts until both go online');
  }
}

// ============================================================ F-web-100 hosts
{
  const F = 'F-web-100';
  const R = {
    prospect: ['gyms.mettleup.fit', 'The gym-owner page (MettleUp for gyms) with its free demo form', 'mettleup.fit/gyms'],
    owner: ['app.mettleup.fit', 'The admin app sign-in or the signed-in Today page', 'mettleup.in'],
    staff: ['app.mettleup.fit', 'The admin app sign-in', 'forgeai.aakashpahuja.in'],
    trainer: ['app.mettleup.fit', 'The admin app sign-in', 'www.mettleup.fit/privacy'],
    member: ['mettleup.fit', 'The member page about the free MettleUp app', 'www.mettleup.fit'],
  };
  for (const role of Object.keys(R)) {
    const [host, sees, old] = R[role];
    J(F, role, 1, `A browser, typing ${host}`, [
      s(`Open ${host}`, [sees], ['Another site\'s page at this address', 'A redirect loop', 'A Not found page']),
    ]);
    J(F, role, 2, `A browser, an old or other MettleUp address`, [
      s(`Open ${old}`, [role === 'staff' ? 'Only the old /home page moves; the admin app at the old address asks to move and carries the sign-in to app.mettleup.fit' : 'A permanent move to the right MettleUp address, path kept'], ['The address bar left on the old address with a broken page', 'A POST turned into a GET (308 kept)']),
    ]);
    J(F, role, 3, 'A browser, a wrong address', [
      s(`Open ${host === 'mettleup.fit' ? 'mettleup.fit' : 'app.mettleup.fit'}/api/nothing`, [host === 'mettleup.fit' ? 'A move to app.mettleup.fit/api/nothing, which answers \'Not found\'' : 'The words \'Not found\' (status 404)'], ['The admin app page served for an /api address', 'A server error page']),
    ]);
    J(F, role, 6, 'The owner of MettleUp has switched the landing pages off (LANDING not live)', [
      s(`Open ${role === 'prospect' ? 'gyms.mettleup.fit' : role === 'member' ? 'mettleup.fit' : 'app.mettleup.fit/home'}`, [role === 'prospect' || role === 'member' ? 'A move to app.mettleup.fit (the admin app)' : 'A move to gyms.mettleup.fit, which then moves to app.mettleup.fit'], ['The hidden page shown anyway', 'A blank page']),
    ]);
    if (['owner', 'staff', 'trainer'].includes(role)) {
      J(F, role, 12, 'Signed in at the old address forgeai.aakashpahuja.in', [
        s('Accept the move to app.mettleup.fit', ['Page \'Opening MettleUp…\' then the admin app, still signed in'], ['The sign-in key shown in the address bar', 'Another site able to send a sign-in into this address']),
        s('Open app.mettleup.fit/api/move from a link on another site', ['The admin app sign-in page'], ['A sign-in written from a page that is not the old address', 'An error page that strands the desk']),
      ], [], ['E-gym-sessions'], ['P-A7-pilot-09']);
    } else N(F, role, 12, 'the address routing shows no personal data and stores nothing about the visitor');
    N(F, role, 4, 'no stored data: the answer depends only on the address and path');
    N(F, role, 5, 'no time edge: routing does not depend on the date or hour');
    N(F, role, 7, 'one server answer per address; there is nothing half-done to interrupt');
    N(F, role, 8, 'no user setting changes which site an address shows; only server switches do (state, type 6)');
    N(F, role, 9, 'a redirect is the same on every screen size and theme');
    if (['owner', 'staff', 'trainer'].includes(role)) {
      T(F, role, 10, ['T10-olddata'], 1, 'E-gym-sessions', 'A sign-in saved at the old address must arrive at app.mettleup.fit and never overwrite one already there');
      T(F, role, 11, ['T11-twopanels'], 1, 'E-gym-sessions', 'Laptop bookmark on the old address, phone on app.mettleup.fit: both end signed in on the new address');
    } else {
      N(F, role, 10, 'nothing saved on the visitor\'s device for this routing');
      N(F, role, 11, 'no sign-in or saved state to carry between devices for this visitor');
    }
  }
}

// ============================================================ F-web-127 desk payments
{
  const F = 'F-web-127';
  const pr = ['P-A7-whats-new-1-77'];
  for (const role of ['owner', 'staff']) {
    J(F, role, 1, 'Member page with dues, a payment company connected, member has a mobile number', [
      s('Tap Collect, then in Pay online tap Make a payment link', ['\'Making the link…\'', 'A QR code of the payment link', '\'Scan with the phone camera to pay by UPI, card or net banking on {name}.\''], ['Two live links for the same dues', 'A link for a different amount from the one shown']),
      s('Tap Send on WhatsApp', ['WhatsApp with \'{payee}: please pay {amount} for {label}. Pay here: {url}\''], ['Another member\'s name or amount in the message']),
      s('The member pays; tap Check or wait for the 10-minute check', ['\'Receipt saved.\''], ['A receipt saved twice', 'The payment saved as cash']),
    ], ['E-pay-requests', 'E-crm-records'], ['E-pay-connections', 'E-pay-gyms'], pr);
    J(F, role, 2, 'Member page with dues, the gym\'s UPI ID saved in Settings, Payments', [
      s(`Tap Show UPI QR for {amount}`, ['UPI QR code to pay {amount}', '\'Scan with any UPI app: Google Pay, PhonePe, Paytm or BHIM.\'', '\'When the money shows in your UPI app or sound box, tap Save payment.\''], [role === 'staff' ? 'A UPI ID other than the gym\'s saved one' : 'A UPI ID the owner did not set']),
      s('Money shows in the sound box; tap Save payment', ['Payment saved; the request is done and any company link for it is closed'], ['The member still able to pay the old link', 'A payment made online a moment ago saved again as cash']),
    ], ['E-pay-requests', 'E-crm-records'], ['E-pay-gyms'], pr);
    J(F, role, 2, 'Member page with dues, the member uses the MettleUp app', [
      s('Tap Send to their app', ['\'Sent. They see it under My membership in the MettleUp app. Tap Save payment when the money shows.\''], ['The request reaching another member\'s app']),
    ], ['E-pay-requests'], ['E-pay-gyms'], pr);
    J(F, role, 3, 'Collect sheet, payment company connected', [
      s('Ask for a payment link for a member with no mobile number', ['\'{name} needs the member’s mobile number for a payment link. Add it to the member, or show the UPI QR.\''], ['A link made without a number', 'The UPI QR hidden too']),
      s('Ask for an amount under ₹1', ['The request refused (BAD_AMOUNT)'], ['A ₹0 link sent to a member']),
      s('No internet; tap Make a payment link', ['\'No internet. Try again.\''], ['A spinner that never ends']),
    ], [], ['E-pay-requests']);
    J(F, role, 6, 'A payment link sent, member has not paid', [
      s('Change the amount and make a new link', ['A new link; the old one is asked once, then closed at the company'], ['The member able to pay both links']),
      s('Cancel the request', ['The request shows cancelled'], ['A payment that already happened hidden by the cancel']),
    ], ['E-pay-requests'], ['E-pay-connections']);
    J(F, role, 6, 'Paid online, receipt not made (the automatic receipt failed)', [
      s('Open Paid online, receipt not made', ['\'These members paid online, but the receipt could not be made by itself. Save each payment by hand, then tap I saved it.\'', '\'{name} paid {amount} online\''], ['A test-mode payment counted as money', 'A refunded payment offered for a receipt']),
      s('Tap I saved it', ['The line goes away'], ['The same payment saved twice by two desks']),
    ], ['E-pay-requests', 'E-crm-records'], [], ['P-A7-panel-2-64']);
    J(F, role, 12, 'Payments switched on, PAY_LIVE off (test mode)', [
      s('Make a payment link', ['\'Test mode: no real money moves.\''], ['A test payment saved as a real receipt']),
      s(role === 'staff' ? 'Open Settings, Payments' : 'Open Settings, Payments as owner', [role === 'staff' ? '\'Only the gym owner can connect a payment company.\'' : 'Connect, Paste keys and Disconnect buttons; the keys are never shown back'], ['The company keys shown on screen', 'Requests of another gym listed']),
    ], [], ['E-pay-requests', 'E-pay-connections'], ['P-A7-panel-2-69', 'P-A7-pilot-81']);
    T(F, role, 4, ['T4-partpaid', 'T4-zeroprice'], 1, 'E-pay-requests', 'Part paid online then cash for the rest; amounts under ₹1 are refused');
    T(F, role, 5, ['T5-midnight'], 3, 'E-pay-requests', 'Link made before midnight, paid after: the receipt date; PhonePe link lasts one hour');
    T(F, role, 7, ['T7-twostaff', 'T7-doubletap', 'T7-offline'], 3, 'E-pay-requests', 'Two desks claim the same receipt (5-minute claim); double tap on Make a payment link');
    T(F, role, 8, ['T8-language'], 2, 'none', 'WhatsApp message words in Hinglish');
    T(F, role, 9, ['T9-360', 'T9-laptop'], 1, 'none', 'QR and buttons on a phone and a desk laptop');
    T(F, role, 10, ['T10-olddata'], 1, 'E-pay-requests', 'A test-mode link made before payments went live must be closed, never reused');
    T(F, role, 11, ['T11-apppanel', 'T11-twopanels'], 3, 'E-pay-requests', 'Desk and member app show the same paid state');
  }
}

// ============================================================ F-web-129 member pays
{
  const F = 'F-web-129', role = 'member';
  J(F, role, 1, 'Member app, My membership, the gym asked for dues by Send to their app', [
    s('Open the request', ['\'Pay your gym\'', '\'Scan this QR with any UPI app.\'', 'Button \'Pay by UPI app\'', '\'After you pay, the gym saves your receipt.\''], ['Another member\'s request', 'A wrong amount']),
    s('Tap Pay by UPI app, pay, come back', ['\'Paid. The gym can see it.\''], ['Paid shown before the money came', 'A second payment asked for']),
  ], ['E-pay-requests'], ['E-pay-gyms', 'E-pay-switches'], ['P-A7-legal-2-23', 'P-A7-pilot-81']);
  J(F, role, 2, 'Member app, Shop, an order placed, not collected', [
    s('Tap Pay for this order', ['A payment page or UPI QR for the order total'], ['An amount different from the order total', 'A payment for a cancelled or collected order']),
    s('Pay and come back', ['\'Paid. The gym can see it.\''], ['The order paid twice when its total changed (old link must close)']),
  ], ['E-pay-requests'], ['E-shop-orders', 'E-pay-gyms'], ['P-A7-legal-2-23']);
  J(F, role, 3, 'The owner switched off Take payments in the member app', [
    s('Open the request in My membership', ['The amount and label', '\'Pay this at the gym desk.\''], ['A QR, UPI link or payment page shown']),
    s('A gym with nothing set up: open the shop order', ['\'Online payment is not set up at this gym yet. Pay at the desk.\''], ['An error code', 'A blank card']),
  ], [], ['E-pay-switches', 'E-pay-requests']);
  J(F, role, 3, 'A payment link older than its time limit', [
    s('Open the request', ['\'This payment link has run out. Ask the desk for a new one.\''], ['A dead link opened']),
  ], [], ['E-pay-requests']);
  J(F, role, 6, 'A payment try failed at the payment company', [
    s('Come back to the app', ['\'Your last try did not go through. You can try again.\''], ['The request shown paid']),
    s('Try again and pay', ['\'Paid. The gym can see it.\''], ['Two payments taken']),
  ], ['E-pay-requests'], ['E-pay-requests']);
  J(F, role, 12, 'Member app in test mode (PAY_LIVE off)', [
    s('Open a request', ['\'Test mode: no real money moves.\''], ['Other members\' requests, ids or payment ids', 'Card, UPI or bank details kept by MettleUp']),
  ], [], ['E-pay-requests'], ['P-A7-pilot-81', 'P-A7-legal-2-23']);
  T(F, role, 4, ['T4-zeroprice', 'T4-partpaid'], 1, 'E-pay-requests', 'An order total under ₹1 is refused; part-paid dues');
  T(F, role, 5, ['T5-month1'], 1, 'E-pay-requests', 'Only requests from the last 30 days are listed; an older open one disappears');
  T(F, role, 7, ['T7-back', 'T7-closed', 'T7-offline'], 2, 'E-pay-requests', 'Leave to the UPI app and come back; the app must check again');
  T(F, role, 8, ['T8-language'], 1, 'none', 'Payment words in Hinglish');
  T(F, role, 9, ['T9-360', 'T9-bigfont'], 1, 'none', 'QR and Pay button on a small phone and big font');
  T(F, role, 10, ['T10-olddata'], 1, 'E-pay-requests', 'An open request made before the app update still opens');
  T(F, role, 11, ['T11-apppanel'], 2, 'E-pay-requests', 'The desk sees the payment as Paid online');
}

// ============================================================ F-web-137 /sb
{
  const F = 'F-web-137', role = 'system';
  J(F, role, 1, 'The admin app or the member app calls the gym server through app.mettleup.fit/sb', [
    s('The app sends a call to /sb/rest/v1/...', ['The gym server\'s answer, with the X-Forge-Proxy stamp'], ['Cookies passed on to the gym server', 'An answer that runs as a page on the admin app address']),
  ], [], ['E-crm-records']);
  J(F, role, 2, 'The owner sends a message to members from Messages & offers', [
    s('The panel calls owner_send_message through /sb', ['The send succeeds'], ['The message saved twice']),
    s('The proxy tells the HQ Worker to send at once', ['Members\' phones get the pop-up within seconds'], ['The pop-up waiting for the next minute', 'A pop-up when the send failed']),
  ], ['E-gym-messages', 'E-push-jobs'], ['E-member-push-tokens'], ['P-A7-whats-new-1-93']);
  J(F, role, 2, 'The owner answers a member\'s workout question', [
    s('The panel calls owner_answer_question through /sb', ['The member\'s phone gets the answer at once'], ['The answer reaching another member']),
  ], ['E-trainer-questions', 'E-push-jobs'], []);
  J(F, role, 3, 'The gym server does not answer', [
    s('An app call to /sb', ['Status 502 and \'The gym server could not be reached. Try again.\' with the unreachable stamp'], ['The same request sent twice', 'A Cloudflare page read as a real answer']),
    s('A call to /sbx', ['Not passed on to the gym server'], ['/sbx treated as /sb']),
  ], [], []);
  J(F, role, 6, 'Cloudflare\'s free daily limit is used up', [
    s('An app call to /sb gets Cloudflare\'s error page with no stamp', ['The apps use the gym server\'s own address for a while'], ['The app stuck on errors', 'A save sent twice']),
  ], [], []);
  J(F, role, 12, 'Any call through /sb', [
    s('An answer comes back', ['The answer with nosniff and a sandbox rule'], ['Our site\'s cookies reaching the gym server', 'A gym server answer able to read the desks\' saved keys']),
  ], [], ['E-gym-sessions']);
  N(F, role, 4, 'the proxy passes each body as it is; data sizes belong to each call\'s own feature');
  N(F, role, 5, 'no time edge: the proxy does nothing by date or hour');
  T(F, role, 7, ['T7-offline'], 2, 'E-push-jobs', 'The HQ kick fails: pop-ups wait for HQ\'s next minute');
  N(F, role, 8, 'no setting changes the proxy; the apps choose it by themselves');
  N(F, role, 9, 'no screen: a server address');
  N(F, role, 10, 'nothing kept between calls; old app versions fall back to the direct address by themselves');
  T(F, role, 11, ['T11-apppanel'], 2, 'E-gym-messages', 'Sent in the panel, seen on the member phone at once');
}

// ============================================================ F-web-108 join link
{
  const F = 'F-web-108';
  const pageSees = ['Gym name as the heading', '\'invites you to the MettleUp app\'', 'The 6-letter gym code'];
  // prospect
  J(F, 'prospect', 1, 'An Android phone without the MettleUp app, a WhatsApp invite link /j/CODE', [
    s('Tap the link', [...pageSees, 'Button \'Join in the MettleUp app\''], ['Another gym\'s name', 'A broken logo picture']),
    s('Tap Join in the MettleUp app', ['Chrome comes back with the card \'First, get the MettleUp app\' and the big button \'Get it on Google Play\''], ['A loop between the page and the store', 'A dead button']),
    s('Install from Google Play, come back, tap Join in the MettleUp app', ['The app opens on joining this gym'], ['The code lost on the way']),
  ], [], ['E-gyms', 'E-gym-logos']);
  J(F, 'prospect', 2, 'A computer browser, the invite link', [
    s('Open the link', ['\'Open this link on your phone\'', '\'Scan this QR code with your phone’s camera.\'', 'A QR code', '\'Your gym’s code\''], ['A Join button that does nothing on a computer']),
  ], [], ['E-gyms']);
  J(F, 'prospect', 2, 'An iPhone, the invite link', [
    s('Open the link', ['The App Store, when the iPhone app is set; otherwise \'The iPhone app is coming soon\' and \'Until then, the front desk at <gym> can add you as a member.\''], ['An Android-only Join button']),
  ], [], ['E-gyms']);
  J(F, 'prospect', 2, 'The invite page of a gym that takes sign-ups online and has plans', [
    s('Read the card Not a member yet?', ['\'Pick a plan and send your details to the gym from this phone. You pay at the gym desk.\'', 'Button \'Become a member\''], ['Words about paying that differ from the Become a member page', 'The card shown for a gym that is closed to sign-ups']),
    s('Tap Become a member', ['The gym\'s Become a member page at /m/CODE'], ['A page for a different gym']),
  ], [], ['E-gyms'], [], 'become');
  J(F, 'prospect', 3, 'A wrong or old invite link', [
    s('Open /j/ with a code that matches no gym', ['\'Gym not found\'', '\'This link doesn’t match a gym\'', '\'Ask your gym for a new link or their gym code.\''], ['An endless spinner', 'Another gym\'s page']),
    s('Open the right link with no internet', ['\'Couldn’t reach the gym\'', '\'Check your internet and open the link again.\''], ['\'Gym not found\' for a gym that exists']),
  ], [], ['E-gyms']);
  J(F, 'prospect', 6, 'The gym switches off online sign-ups after the link was sent', [
    s('Open the invite link again', [...pageSees, 'No Not a member yet? card'], ['A Become a member button that leads to a closed page']),
  ], [], ['E-gyms']);
  J(F, 'prospect', 12, 'The invite link forwarded to a stranger', [
    s('The stranger opens the link and the WhatsApp preview', ['Only the gym\'s name, code and logo; title \'Join <gym> on MettleUp\''], ['Any member\'s name or number', 'The inviter\'s phone number']),
  ], [], ['E-gyms'], []);
  // member
  J(F, 'member', 1, 'An Android phone with the MettleUp app, the invite link from the gym', [
    s('Tap the link', [...pageSees], ['Another gym']),
    s('Tap Join in the MettleUp app', ['The MettleUp app opens on joining this gym'], ['The Play Store when the app is already installed']),
  ], [], ['E-gyms']);
  J(F, 'member', 2, 'An Android phone with only the older ForgeAI app', [
    s('Tap Join in the MettleUp app', ['Chrome comes back with try=old and opens the older app on the join'], ['A loop', 'A dead end with no way to Google Play']),
  ], [], ['E-gyms']);
  J(F, 'member', 3, 'A link with a short code', [
    s('Open /j/ABCDE (5 letters)', ['\'Gym not found\''], ['A server error page']),
  ], [], []);
  J(F, 'member', 6, 'The gym changed its name a minute ago', [
    s('Open the invite link', ['The old name for up to 5 minutes, then the new name'], ['The old name kept for longer than 5 minutes']),
  ], [], ['E-gyms']);
  J(F, 'member', 12, 'The invite link preview in WhatsApp', [
    s('Look at the link preview', ['\'Join <gym> on MettleUp\'', '\'<gym> invites you to the MettleUp app. Tap to join. Gym code <code>.\''], ['The member\'s own name or number in the preview']),
  ], [], ['E-gyms'], []);
  for (const role of ['prospect', 'member']) {
    T(F, role, 4, ['T4-long', 'T4-nophoto', 'T4-hinglish'], 1, 'E-gyms', 'Long or Hindi gym name in the heading and preview; no logo shows the initial');
    N(F, role, 5, 'no time edge: the page shows no dates; the 5-minute preview copy is a state (type 6)');
    T(F, role, 7, ['T7-back', 'T7-offline'], 2, 'none', 'Chrome comes back from the app attempt; no internet shows Couldn’t reach the gym');
    N(F, role, 8, 'the page has no settings; it shows English and Hinglish lines together and follows the device theme (type 9)');
    T(F, role, 9, ['T9-360', 'T9-laptop', 'T9-dark'], 1, 'none', 'Phone, computer with QR, dark device');
    if (role === 'member') T(F, role, 10, ['T10-olddata'], 2, 'none', 'Only the older ForgeAI app installed');
    else N(F, role, 10, 'a prospect has no app installed yet, so there is no old version');
    N(F, role, 11, 'the page only opens the app; joining itself is the app\'s own feature');
  }
}

// ============================================================ F-web-109 check-in link
{
  const F = 'F-web-109', role = 'member';
  J(F, role, 1, 'At the gym, Android phone with the MettleUp app, the check-in QR poster', [
    s('Scan the poster QR', ['\'Check in at <gym>\'', 'Button \'Check in with the MettleUp app\'', '\'No app? No problem.\' \'The front desk can check you in.\''], ['Another gym\'s name']),
    s('Tap Check in with the MettleUp app', ['The app opens its check-in screen for this gym'], ['A check-in at another gym', 'A loop back to the page']),
  ], [], ['E-gyms'], ['P-A7-phone-watch-2-33']);
  J(F, role, 2, 'Android phone without the app', [
    s('Scan the poster, tap Check in with the MettleUp app', ['Card \'First, get the MettleUp app\'', '\'Join your gym in the app, then scan the poster again.\'', 'Button \'Get it on Google Play\''], ['A dead end']),
  ], [], ['E-gyms']);
  J(F, role, 2, 'An iPhone', [
    s('Scan the poster', ['\'MettleUp is an Android app for now\'', '\'Check in at the front desk today.\''], ['A Check in button that cannot work']),
  ], [], ['E-gyms']);
  J(F, role, 3, 'An old or wrong poster', [
    s('Scan a poster whose code matches no gym', ['\'This poster doesn’t match a gym\'', '\'Check in at the front desk, and ask them for a new poster.\''], ['A check-in at a wrong gym']),
    s('Scan with no internet', ['\'Couldn’t reach the gym\''], ['\'Gym not found\' for a real gym']),
  ], [], ['E-gyms']);
  J(F, role, 6, 'Only the older ForgeAI app installed', [
    s('Tap Check in with the MettleUp app', ['Chrome comes back with try=old and opens the older app'], ['A loop between the two']),
  ], [], ['E-gyms']);
  J(F, role, 12, 'Anyone scans the poster', [
    s('Open the page', ['Only the gym\'s name and logo'], ['A member\'s name or number on the page']),
  ], [], ['E-gyms'], ['P-A7-phone-watch-2-33']);
  T(F, role, 4, ['T4-long', 'T4-nophoto'], 1, 'E-gyms', 'Long gym name in Check in at <gym>; no logo');
  N(F, role, 5, 'no time edge on the page; the check-in time is set in the app');
  T(F, role, 7, ['T7-back', 'T7-offline'], 2, 'none', 'Chrome comes back from the app attempt');
  N(F, role, 8, 'the page has no settings; it shows English and Hinglish lines together');
  T(F, role, 9, ['T9-360', 'T9-dark'], 1, 'none', 'Small phone, dark device');
  T(F, role, 10, ['T10-olddata'], 2, 'none', 'Older ForgeAI app installed');
  T(F, role, 11, ['T11-apppanel'], 2, 'E-crm-records', 'The desk sees the check-in after the app does it');
}

// ============================================================ finding
rows.push({
  kind: 'finding', id: 'FN-A5-web-pages-1-01', date: '2026-11-20', lens: 'A5', surface: 'web', area: 'web/pages', refs: [ids.become], severity: 'S3',
  title: 'The invite page always says "You pay at the gym desk", even when the gym takes join payments online',
  what: 'The "Not a member yet?" card on a gym\'s invite link page always says the person pays at the gym desk. The link preview was changed to drop that sentence once online join payments are on, because the gym may then take the money online, but the card itself was not.',
  expected: 'The card says nothing about how to pay, or says the right way for this gym, like the link preview does.',
  evidence: ['apps/dashboard/public/join.html:118', 'deploy/panel/worker.js:302'], proof: 'code-read', root_cause_key: 'join-card-fixed-pay-words',
  who: 'people invited to a gym that takes online join payments', how_often: 'every visit once join payments are on', fix_line: 'Drop the pay sentence from the card, or fill it the same way as the preview',
  fix_size: 'small', needs_him: false, verified: 'pending', status: 'open',
});

fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const j = rows.filter((r) => r.kind === 'journey').length, t = rows.filter((r) => r.kind === 'jtype').length;
console.log('rows', rows.length, 'journeys', j, 'type lines', t);
