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
}

export interface AdminNewsEntry {
  /** The day it went live, YYYY-MM-DD. Also what "seen" remembers. */
  id: string;
  lines: readonly AdminNewsLine[];
}

/** Newest first. member-words: Gemini second opinion + facts checked against the commits (28 Oct 2026). */
export const ADMIN_NEWS: readonly AdminNewsEntry[] = [
  {
    // R-388 (owner, 7 Nov 2026): Branding reloaded itself every few seconds and lost the owner's unsaved pick.
    id: '2026-11-07',
    lines: [
      {
        text: 'Settings → Branding: the page no longer loses the logo or colour you pick before you tap Save.',
        go: { label: 'Open Branding', path: '/settings/branding' },
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
      },
      {
        // T79 (0060 live and admin panel deployed 6 Nov 2026). Online buying, receipts and
        // plan-end reminders are switched off and are NOT mentioned (R-333).
        text: 'Settings → Pay MettleUp: pay for your MettleUp plan by UPI or bank transfer, then send us the reference number. This page shows when we confirm your payment and until when your plan is paid.',
        go: { label: 'Open Pay MettleUp', path: '/settings/mettleup' },
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
      },
      {
        // F147 (0056 + D1 0010 live 5 Nov).
        text: 'Bring a friend: members can now send a friend a link to your gym from the MettleUp app. The friend shows in Enquiries with the member’s name. In Settings → Member app, choose free days for the member when a friend joins.',
        go: { label: 'Open Settings', path: '/settings/app' },
      },
      {
        // F79 (D1 0011 live 5 Nov, test mode).
        text: 'Settings → Payments: add your UPI ID, and the desk can show a UPI QR code for each payment. Online payment links work in test mode only for now: no real money moves.',
        go: { label: 'Open Payments', path: '/settings/payments' },
      },
      {
        // F109 (0050 live 3 Nov).
        text: 'Trainers: in Settings → People, tick "Trainer" on a staff member. They then see their members’ weekly progress under "Training progress". This page was called "My members" before.',
        go: { label: 'Open People', path: '/settings/people' },
      },
      {
        // F137 (0049 live 3 Nov).
        text: 'Busy machines: switch it on in Settings → Member app, and members see when each machine is usually busy, so they can pick a quieter time.',
        go: { label: 'Open Settings', path: '/settings/app' },
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
];
