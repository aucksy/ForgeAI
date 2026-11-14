/**
 * "What's new" in the admin app (R-148, picked by the owner 28 Oct 2026). Mirrors the member app's
 * apps/mobile/src/lib/whatsNew.ts: a small typed list, newest first, and a one-time card.
 *
 * The admin app has no version number of its own (it is a web page, updated by each deploy), so an
 * update is named by its day: `id` is that day (YYYY-MM-DD, sorts as text). The newest entry in the
 * list IS the version this browser runs, because the list ships inside the page.
 *
 * - The first time the admin app opens after an update, Today shows a short card with what changed
 *   since the update this browser last saw (at most SHOWN_UPDATES updates). "Got it" hides it until
 *   the next update.
 * - Like the member app, the first update a browser ever meets is only remembered, never announced:
 *   a new owner has nothing "new", and the admin journeys (fresh browsers) must not see a card that
 *   moves every screen. So the card shows from the NEXT update on. Settings → What's new keeps the
 *   whole list to read at any time.
 *
 * Add an update at the TOP of ADMIN_NEWS when it is deployed. Words: member-words skill (R-98): say
 * where, then what it does for the owner or the desk; one short line each; page names as the app shows them.
 */

/** One change, in one short sentence. `go`: a button that opens the page where it is. */
export interface AdminNewsLine {
  text: string;
  go?: { label: string; path: string };
  /**
   * F198 (R-389): a NEW feature, never a fix. With a `go` path it puts small dots on the way to that page
   * (menu, Settings row, page heading) for 30 days, until the owner opens it (logic/newDots.ts).
   */
  feature?: true;
}

export interface AdminNewsEntry {
  /** The day it went live, YYYY-MM-DD. Also what "seen" remembers. */
  id: string;
  lines: readonly AdminNewsLine[];
}

/** Newest first. member-words: Gemini second opinion + facts checked against the commits (28 Oct 2026). */
export const ADMIN_NEWS: readonly AdminNewsEntry[] = [
  {
    // R-495 (owner, 14 Nov 2026): the gym's own logo top-left in the admin app, for the owner, the desk and trainers.
    // Panel code only (the logo is the one saved in Branding). id = the deploy day: change it if the deploy is later.
    id: '2026-11-14',
    lines: [
      // The logo line stays first: it is the summary under the bell (e2e/whatsnew.spec.mjs J149).
      {
        text: 'Your gym’s logo now shows at the top of the admin app, next to your gym’s name. Your staff see it too. To add or change it, open Branding.',
        go: { label: 'Open Branding', path: '/settings/branding' },
      },
      {
        // R-526 (owner, 14 Nov 2026): the side menu (and the phone's More) in five groups; Get started out of Today.
        text: 'In the menu, pages now sit under five headings: Members, Money, Training, Reach members and Your gym. Your first steps moved from Today to a new page, "Set up your gym". A green ring shows how many are done.',
        go: { label: 'Open Set up your gym', path: '/setup' },
      },
      // R-506/R-510 (moved from ADMIN_NEWS_PENDING at the deploy): 0075 + 0076 live, VAPID key set, HQ 558464b7.
      {
        text: 'New on Today: "Latest from your members". It shows when a member asks a question, sends a message or a complaint, orders from the shop, pays online or joins your gym. Tap a line to open it.',
      },
      {
        // Fresh eyes (14 Nov 2026): Needs you now follows a reply at once (one shared count with the menu).
        text: 'Needs you on Today now also counts questions for trainers and member messages waiting for your reply. It goes down as soon as you reply. With alerts on, you hear a sound when a new one comes in.',
      },
      {
        // R-506 phase 3 (0076): Web Push.
        text: 'New: alerts on your phone or computer even when the admin app is closed. Complaints, shop orders and members waiting at the check-in poster come at once. Turn them on, and pick when the rest come, in Settings.',
        go: { label: 'Open Settings', path: '/settings' },
        feature: true,
      },
      {
        // Fresh eyes (14 Nov 2026): two places were called "Questions".
        text: 'The page where you answer what members ask a trainer is now called "Questions for trainers", in the menu. Questions, feedback and complaints sent to the gym stay in Member messages.',
      },
      {
        text: 'Member messages now opens on the right type when you tap a line on Today, and each type button says how many wait for a reply, like "Complaints · 1 waiting".',
      },
      {
        // R-526: Get started has its own page now (the line above), so it is no longer named here.
        text: 'Today now shows one setup card at a time (first alerts, then putting the admin app on your phone), so the page is shorter.',
      },
      {
        text: 'In the AI Assistant, a day you pick now also shows in words, like "Sun, 18 Oct". When a message is ready, its Send button comes fully into view.',
      },
      // R-502: the desk camera photo keeps the preview's mirror flip (it was saved flipped back).
      { text: 'A member photo taken with the camera now looks exactly like the camera preview. It no longer flips after you tap "Take photo".' },
      {
        // R-501 (owner, 14 Nov 2026): "Both" on an AI greeting kept English and it went out in English only.
        text: 'In the AI Assistant, tapping Hindi or Both on a message now writes the Hindi words first, so you see them before you send. Before, the message could still go out in English only.',
      },
      {
        // R-514 (owner, 14 Nov 2026): a "Gym closed" message went with no day, and it was not clear when it would go.
        text: 'In the AI Assistant, a "Gym closed" message now always says which day, with the date. Its button says when it goes: "Send now", or the day and time you picked.',
      },
    ],
  },
  {
    // R-480 (13 Nov 2026, owner: "yes you can put AI assistant live as well"; wording approved): F201 AI Assistant
    // live (0071 + 0072 on the gym server, D1 0015, HQ and panel deployed 13 Nov) and the 4 policy pages on the site.
    id: '2026-11-13',
    lines: [
      {
        text: 'New: the AI Assistant, in the menu. Type or say what you need, in Hindi or English. It gets a message or a change ready for you to check. Nothing is sent or saved until you tap its button.',
        go: { label: 'Open the AI Assistant', path: '/assistant' },
        feature: true,
      },
      {
        text: 'Asking the AI Assistant a question is free. Each message it sends, and each member or payment it saves, uses 1 AI credit. Each workout plan it writes and you save uses 3.',
      },
      {
        text: 'Your free trial comes with 20 AI credits, once. Paid yearly plans and founding gyms get free credits every month: 50 on Starter, 100 on Pro. Monthly plans get none.',
      },
      {
        text: 'The MettleUp privacy notice now explains what the AI Assistant sends to Claude and Groq, and how long your requests are kept. Read it at mettleup.fit/privacy.',
      },
      {
        text: 'The MettleUp website now has pages on refunds and cancelling, how you get access after you pay, how to contact us, and about MettleUp. Find them at the bottom of gyms.mettleup.fit.',
      },
    ],
  },
  {
    // 12 Nov 2026: MettleUp goes public on Google Play in every country; the owner said yes to EU/UK privacy
    // lines ("yes add those lines why not"). Section 12 of docs/legal/privacy.body.html; nothing collected changed.
    id: '2026-11-12',
    lines: [
      {
        text: 'The MettleUp privacy notice has a new section for members in the EU, the EEA and the UK. It explains their rights and the legal reason for each use of their data. Read it at mettleup.fit/privacy.',
      },
      {
        // R-459 (owner, 12 Nov 2026: "All yes"; 0069 live, panel deployed the same day). Members get the Gym tab
        // row with the next app release, so the line does not promise they can send today (coordinator's words).
        text: 'New: Member messages. When members update their app, they can send you questions, feedback and complaints here.',
        go: { label: 'Open Member messages', path: '/member-messages' },
        feature: true,
      },
    ],
  },
  {
    // R-448 (owner "okay go ahead", 10 Nov 2026; deployed 11 Nov IST).
    id: '2026-11-11',
    lines: [
      {
        text: 'Forgot your PIN? Tap "Can’t use WhatsApp? Other ways back in". For example, make a sign-in code on another phone or computer where you are signed in. Then choose a new PIN.',
      },
      {
        text: 'Checking your number on WhatsApp: the message now tells you to come back to the MettleUp page after you tap Send. Back on the page, it says "Checking your message…".',
      },
      {
        text: 'In Settings → Sign-in & data, the button "Clear this device’s saved data" is now "Clear offline copy", with a note on what it does. It never deletes your gym’s records online.',
        go: { label: 'Open Settings', path: '/settings/data' },
      },
      {
        // R-449 (R-447 fresh eyes): two cards moved to where an owner looks for them; deployed the same day, merged.
        text: 'The card to put the admin app on your phone or computer is now on the first Settings tab, Gym.',
        go: { label: 'Open Settings', path: '/settings' },
      },
      {
        text: '"MettleUp access", where you let MettleUp support look at your records and see each time they did, is now on Help and feedback.',
        go: { label: 'Open Help and feedback', path: '/feedback' },
      },
      {
        // R-450 (R-449 fresh eyes): the dues filters counted memberships, so "All 26" sat over 24 people; deployed the
        // same day, merged.
        text: 'Money → Dues: each filter ("Up to 30 days" and the others) now shows how many people are in its list. Each tile says how many memberships are not fully paid.',
        go: { label: 'Open Dues', path: '/money/dues' },
      },
    ],
  },
  {
    // R-445 (owner: "all as recommended", 10 Nov 2026): new terms, data agreement and privacy notice live; 0067
    // (terms version 2026-11-10) applied live, so every owner is asked once more at sign-in (TermsGate).
    id: '2026-11-10',
    lines: [
      {
        text: 'We updated the MettleUp terms and the data agreement for gyms. The next time you sign in as the owner, please read them and tick "I agree" again. Your staff are not asked.',
      },
      {
        text: 'The data agreement now ends with a short notice for your members. It tells them your gym keeps their membership, payments and visits in MettleUp. Copy it from mettleup.fit/data-agreement.',
      },
      {
        text: 'We rewrote the MettleUp privacy notice in simpler words. It now lists every company that helps run MettleUp. Read it at mettleup.fit/privacy.',
      },
      {
        // R-425 (9 Nov 2026): the steel-plate name on the sign-in page, the Welcome page and the menu. Moved here
        // from 2026-11-09: it was added after that update went live, and goes live with this one.
        text: 'The MettleUp name now has its new look on the sign-in page and at the bottom of the menu, the same as in the member app.',
      },
      {
        // R-446 (owner, 10 Nov 2026): iPhone install steps were one hard-to-see line naming a Share button iOS 26
        // hides; the home-screen app opened signed out; "new" dots showed to brand-new gyms. Deployed 10 Nov 2026,
        // after this day's first update had gone live, so merged into it (one id per day).
        text: 'On iPhone, Settings now shows clear numbered steps to put the admin app on your home screen. The first time you open it from there, sign in once more. After that, you stay signed in.',
        // R-449: the install card moved to the Gym tab.
        go: { label: 'Open Settings', path: '/settings' },
      },
      {
        text: 'The small "new" dots in the menu now only show for things added after your gym joined MettleUp.',
      },
      {
        // R-447 (10 Nov 2026, fresh-eyes findings): deployed after this day's update had gone live; merged into it.
        text: 'On the sign-in page, "Sign in" is now the main button. To start a new gym, tap "Set up a new gym" under "New to MettleUp?".',
      },
      {
        text: 'On a computer, the whole menu on the left now fits most screens, with "Invite members" added. "Dark" and "Light" moved to the top right. In a small window, tap "More below".',
      },
      {
        text: 'In Settings → Sign-in & data, two cards have clearer names: "Download a backup" and "Your gym’s records".',
        go: { label: 'Open Settings', path: '/settings/data' },
      },
    ],
  },
  {
    // 0053 + 0054 applied live 9 Nov 2026 (owner: "yes, apply 0053 and 0054"); live tests PASS 68 and 23.
    id: '2026-11-09',
    lines: [
      {
        text: 'New "Questions" page: members can now ask a trainer a question in their MettleUp app. You or the trainer they picked reply here, and the member gets a notification on their phone.',
        go: { label: 'Open Questions for trainers', path: '/questions' },
        feature: true,
      },
      {
        text: 'Members now get a notification on their phone when you approve their pause or renewal, send the workout report they asked for, or have their shop order ready.',
      },
    ],
  },
  {
    // Verify with WhatsApp (owner yes 8 Nov 2026): inbound mode, number 918690560741. Sign-in page only, so no `go`.
    id: '2026-11-08',
    lines: [
      {
        text: 'Forgot your PIN? On the sign-in page, tap "Verify with WhatsApp" and send MettleUp one free WhatsApp message. Then choose a new PIN.',
      },
    ],
  },
  {
    // R-388 (owner, 7 Nov 2026): Branding reloaded itself every few seconds and lost the owner's unsaved pick.
    id: '2026-11-07',
    lines: [
      {
        // F105 (0065 applied live 7 Nov 2026, owner yes). Lands with the 7 Nov deploy: the dots lead to /trainers.
        text: 'More → Trainers: each trainer gets a page with their photo, hours and personal-training members. Book members with a free trainer for personal training.',
        go: { label: 'Open Trainers', path: '/trainers' },
        feature: true,
      },
      {
        text: 'Settings → Branding: the page no longer loses the logo or colour you pick before you tap Save.',
        go: { label: 'Open Branding', path: '/settings/branding' },
      },
      {
        // R-390: 0063 live 7 Nov 2026, TRIAL_KEPT_ON_PAY on.
        text: 'Settings → Pay MettleUp: if you pay during your free trial, you keep every free day. Your paid plan starts when the trial ends.',
        go: { label: 'Open Pay MettleUp', path: '/settings/mettleup' },
      },
      {
        // F198 (R-389/R-390): the new-feature dots, deployed 7 Nov 2026. Not itself marked as a feature (no page to lead to).
        text: 'A small orange dot now shows the way to each new feature: on the menu, on the button, and next to the page title. Open the feature and its dot goes away.',
      },
    ],
  },
  {
    // T74 (R-356): the home-screen icon preview under the logo. Deployed 6 Nov 2026.
    id: '2026-11-06',
    lines: [
      {
        text: 'Settings → Branding: see how your logo looks as an icon on a member’s phone home screen. It shows right under your logo.',
        go: { label: 'Open Branding', path: '/settings/branding' },
        feature: true,
      },
      {
        // T79 (0060 live and admin panel deployed 6 Nov 2026). Online buying, receipts and
        // plan-end reminders are switched off and are NOT mentioned (R-333).
        text: 'Settings → Pay MettleUp: pay for your MettleUp plan by UPI or bank transfer, then send us the reference number. This page shows when we confirm your payment and until when your plan is paid.',
        go: { label: 'Open Pay MettleUp', path: '/settings/mettleup' },
        feature: true,
      },
    ],
  },
  {
    // R-333 (owner, 5 Nov 2026: "why did I not see any notification for this new functionality?"): the 1-5 Nov
    // deploys went out with no entry. One entry for all of them; only what is live (0053 Ask a trainer is not).
    id: '2026-11-05',
    lines: [
      {
        // F123 (0055 live 5 Nov).
        text: 'FITPASS, cultpass and other pass members: open a member and turn on "Comes with a pass". They get no plan and no dues, and each check-in counts as a pass visit under Visits → Pass visits.',
        go: { label: 'Open Members', path: '/members' },
        feature: true,
      },
      {
        // F147 (0056 + D1 0010 live 5 Nov).
        text: 'Bring a friend: members can now send a friend a link to your gym from the MettleUp app. The friend shows in Enquiries with the member’s name. In Settings → Member app, choose free days for the member when a friend joins.',
        go: { label: 'Open Settings', path: '/settings/app' },
        feature: true,
      },
      {
        // F79 (D1 0011 live 5 Nov, test mode).
        text: 'Settings → Payments: add your UPI ID, and the desk can show a UPI QR code for each payment. Online payment links work in test mode only for now: no real money moves.',
        go: { label: 'Open Payments', path: '/settings/payments' },
        feature: true,
      },
      {
        // F109 (0050 live 3 Nov).
        text: 'Trainers: in Settings → People, tick "Trainer" on a staff member. They then see their members’ weekly progress under "Training progress". This page was called "My members" before.',
        go: { label: 'Open People', path: '/settings/people' },
        feature: true,
      },
      {
        // F137 (0049 live 3 Nov).
        text: 'Busy machines: switch it on in Settings → Member app, and members see when each machine is usually busy, so they can pick a quieter time.',
        go: { label: 'Open Settings', path: '/settings/app' },
        feature: true,
      },
      {
        // UAT fresh-eyes fixes, 5 Nov 2026.
        text: 'Small fixes: Today’s numbers now say "Fees due" in full rupees, a pass member’s page no longer asks you to sell a membership twice, and pages that send you to Settings name the right tab.',
      },
    ],
  },
  {
    id: '2026-10-31',
    lines: [
      {
        // R-234 A-15: full rupees on Money and Today.
        text: 'On Money and Today you now see full amounts, like ₹12,500, not short forms like ₹12.5k.',
        go: { label: 'Open Money', path: '/money' },
      },
      {
        // R-234 B-18: saleWarning, one warning with every reason.
        text: 'Sell membership: if the price is above the plan’s price, or the plan starts over 30 days later than usual, the app asks you to check once. Tap "Yes, save" to keep it.',
      },
      {
        // R-234 A-29: no collection over the amount due.
        text: 'Collect payment: the app no longer takes more than the member owes.',
      },
      {
        // R-234 B-11: Welcome tabs.
        text: 'The sign-in page now has two tabs: "Sign in" and "Set up a new gym".',
      },
    ],
  },
  {
    id: '2026-10-30',
    lines: [
      {
        // F150, 0044 live.
        text: 'On Today, "Requests from the app" shows members who asked to pause or renew their plan. Tap Approve or Decline.',
      },
      {
        // F121, 0045 live.
        text: 'On a member’s page, tap "Request workout report". When their app sends it, tap "Download report".',
        go: { label: 'Open Members', path: '/members' },
      },
    ],
  },
  {
    id: '2026-10-29',
    lines: [
      {
        // R-168: Your numbers on Today.
        text: 'On Today, "Your numbers" shows 5 key numbers for your gym. Tap one to see the members behind it, call or WhatsApp them, or download the list.',
      },
      {
        // Your growth, owner only.
        text: '"Your growth" (owners only, under More): see month by month if your gym is growing since it started on MettleUp.',
        go: { label: 'Open Your growth', path: '/growth' },
      },
      {
        // F107: desk webcam photo.
        text: 'When you add or edit a member, "Take photo" uses the desk computer’s camera.',
      },
      {
        // R-160: colour from the logo, no AI.
        text: 'Settings → Branding: the app suggests a gym colour from your logo.',
        go: { label: 'Open Branding', path: '/settings/branding' },
      },
    ],
  },
  {
    id: '2026-10-28',
    lines: [
      {
        // R-157: the AI matches the columns by itself when the file opens (no "Ask AI" button).
        text: 'Import members: the app now matches your Excel columns by itself, using AI. Check the columns and change any that are wrong.',
        go: { label: 'Import members', path: '/members/import' },
      },
      {
        // R-155: of several phone columns, the one with the most real mobile numbers wins.
        text: 'Import members: if your sheet has more than one phone column, the app picks the one with real mobile numbers. You can change it on the same page.',
      },
      {
        // R-153 step 2 / R-162: FCM push, live with MettleUp 0.59.0.
        text: 'Messages and offers you send from "Messages & offers" now pop up on members\' phones at once, even when their app is closed. Members need MettleUp 0.59.0 or newer, with notifications allowed.',
        go: { label: 'Open Messages & offers', path: '/messages' },
      },
    ],
  },
  {
    id: '2026-10-26',
    lines: [
      {
        // R-133: challenge + leaderboard (0037 live 26 Oct).
        text: 'New "Challenges" page: set a goal for the month, in workouts or kg lifted. Every member who reaches it wins, and members see a top 10 list in their app.',
        go: { label: 'Open Challenges', path: '/challenges' },
      },
    ],
  },
  {
    id: '2026-10-25',
    lines: [
      {
        // R-124: 0036 live.
        text: 'New "Gym timings" page: add your morning and evening hours for each day (or 24 hours) and holidays. Members see in their app if you are open now.',
        go: { label: 'Open Gym timings', path: '/settings/timings' },
      },
    ],
  },
  {
    id: '2026-10-24',
    lines: [
      {
        // R-120: 0035 live.
        text: 'New "Diet plans" page: trainers send members what to eat. Members read it in their app.',
        go: { label: 'Open Diet plans', path: '/diet' },
      },
      { text: 'On a member\'s page, "Body measurements" lets the trainer note weight and body sizes, so you can see their progress.' },
      {
        // R-117: 0034 live.
        text: 'Each person who signs in now has their own 6-digit PIN that keeps working, so nobody waits for a new code.',
        go: { label: 'Open Staff & sign-in', path: '/settings/people' },
      },
    ],
  },
];

/** The most updates the card lists at once (the member app's "last three updates"). */
export const SHOWN_UPDATES = 3;

/** "28 Oct 2026" from "2026-10-28". PURE. */
export function newsDay(id: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id);
  if (!m) return id;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}

/** The update this page is (the newest in the list), or null for an empty list. PURE. */
export function currentNews(log: readonly AdminNewsEntry[] = ADMIN_NEWS): string | null {
  return log[0]?.id ?? null;
}

/**
 * What the card shows: the updates newer than the one this browser last saw, newest first, at most
 * `max`. Nothing for a browser that never saw one (`seen` null: remembered, not announced). PURE.
 */
export function newsToShow(seen: string | null, log: readonly AdminNewsEntry[] = ADMIN_NEWS, max = SHOWN_UPDATES): readonly AdminNewsEntry[] {
  if (seen == null) return [];
  return log.filter((e) => e.id > seen && e.lines.length > 0).slice(0, max);
}

/** The storage this uses (localStorage in the browser, a Map in tests). */
export interface NewsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SEEN_KEY = 'forgeai.adminNews.seen.v1';

/** This browser's storage, or null when it cannot be used (also for logic/hqNews.ts). */
export function browserStore(): NewsStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (e) {
    console.warn('[whats new] no storage', e);
    return null;
  }
}

/**
 * The updates to show now. A browser meeting its first update remembers it and shows nothing.
 * Never throws (no storage = nothing to show).
 */
export function readNews(store: NewsStore | null = browserStore(), log: readonly AdminNewsEntry[] = ADMIN_NEWS): readonly AdminNewsEntry[] {
  const current = currentNews(log);
  if (!store || !current) return [];
  try {
    const seen = store.getItem(SEEN_KEY);
    if (seen == null) {
      store.setItem(SEEN_KEY, current);
      return [];
    }
    return newsToShow(seen, log);
  } catch (e) {
    console.warn('[whats new] could not read', e);
    return [];
  }
}

/** "Got it": hide the card until the next update. Never throws. */
export function markNewsSeen(store: NewsStore | null = browserStore(), log: readonly AdminNewsEntry[] = ADMIN_NEWS): void {
  const current = currentNews(log);
  if (!store || !current) return;
  try {
    store.setItem(SEEN_KEY, current);
  } catch (e) {
    console.warn('[whats new] could not save', e);
  }
  notifyNewsSeen();
}

/**
 * R-239: fired on the page when this browser marks the news seen, so the bell's count and the
 * Today card agree (open the bell: the card goes; "Got it" on the card: the count goes).
 */
export const NEWS_SEEN_EVENT = 'forgeai:admin-news-seen';

function notifyNewsSeen(): void {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(NEWS_SEEN_EVENT));
  } catch (e) {
    console.warn('[whats new] could not tell the page', e);
  }
}

/**
 * Owner-visible changes built but NOT deployed yet. They move to the top of ADMIN_NEWS (with `id` set to
 * the deploy day) in the same commit as the admin-panel deploy (R-333). Never shown before the change is live.
 */
export const ADMIN_NEWS_PENDING: readonly AdminNewsEntry[] = [
  {
    // F56 R-461, 12 Nov 2026: the MettleUp Plus switch (0070). Moves to ADMIN_NEWS only when 0070 is live, the panel is
    // deployed AND the app's paid plan is switched on (MEMBER_PLAN_GATE_ON); until then the card is hidden anyway.
    id: 'pending-plus-lock',
    lines: [
      {
        text: 'Your members now get every paid feature of the MettleUp app free while their plan is active. In Settings, Member app, choose whether those features lock 7 days after a plan ends. Members never lose their workouts.',
        go: { label: 'Open Settings', path: '/settings/app' },
        feature: true,
      },
    ],
  },
];
