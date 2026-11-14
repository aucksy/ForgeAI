/**
 * F147 Bring a friend (4 Nov 2026): the Gym tab's "Bring a friend" card. The member shares a link from the
 * phone's share menu; the friend opens a small page with the gym's name and leaves a name, phone number and
 * a good time to train; it lands in the gym's Enquiries marked "Referred by <member>". The member sees only
 * how many friends joined, never who asked or their numbers.
 * Server: supabase/migrations/0056_bring_a_friend.sql member_friend_invite. Hidden until that is live.
 * Owner rule: complete, simple sentences; the app never says "volume", "PR" or "session".
 * Pure: words, the share text and the answer reader; BringFriendCard.tsx draws it.
 */

/** The page friends open. /f/ is served by the panel Worker (deploy/panel/worker.js) and never opens the app. */
export const FRIEND_LINK_BASE = 'https://app.mettleup.fit/f/';
/**
 * R-539: the same page on join.mettleup.fit, outside the gym's admin app (on a phone with the admin app installed,
 * an app.mettleup.fit link opened inside it, its splash first). Used only once the panel's Worker says so
 * (https://app.mettleup.fit/api/links answers {join: 'https://join.mettleup.fit'}; friendLinkBase.ts asks).
 */
export const FRIEND_LINK_BASE_JOIN = 'https://join.mettleup.fit/f/';

/** /api/links's answer as the link base: join.mettleup.fit only when it says exactly that. PURE. */
export function friendLinkBaseFrom(raw: unknown): string {
  const join = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { join?: unknown }).join : undefined;
  return join === 'https://join.mettleup.fit' ? FRIEND_LINK_BASE_JOIN : FRIEND_LINK_BASE;
}

const CODE = /^[A-HJ-NP-Z2-9]{8}$/;

export const FRIEND_WORDS = {
  title: 'Bring a friend',
  body: 'Send a friend a link to your gym. They leave their number, and the gym calls them.',
  button: 'Invite a friend',
} as const;

export interface FriendInvite {
  code: string;
  gymName: string;
  /** Free days the gym gives this member for each friend who joins; null when the gym gives none. */
  rewardDays: number | null;
  /** Friends this member invited who became members. */
  joined: number;
}

/** member_friend_invite's answer, or null for anything else (a member who left, a paused gym, a damaged row). PURE. */
export function friendInviteFrom(raw: unknown): FriendInvite | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.ok !== true || typeof r.code !== 'string' || !CODE.test(r.code)) return null;
  const gymName = typeof r.gymName === 'string' ? r.gymName.trim() : '';
  const d = r.rewardDays;
  const rewardDays = typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 60 ? d : null;
  const j = r.joined;
  const joined = typeof j === 'number' && Number.isFinite(j) && j > 0 ? Math.floor(j) : 0;
  return { code: r.code, gymName, rewardDays, joined };
}

export function friendLink(code: string, base: string = FRIEND_LINK_BASE): string {
  return `${base === FRIEND_LINK_BASE_JOIN ? FRIEND_LINK_BASE_JOIN : FRIEND_LINK_BASE}${code}`;
}

/** What the share menu sends (WhatsApp and the rest). */
export function friendMessage(invite: Pick<FriendInvite, 'code' | 'gymName'>, base: string = FRIEND_LINK_BASE): string {
  const gym = invite.gymName || 'my gym';
  return `Come and train with me at ${gym}! Leave your name and number on this page, and the gym will call you: ${friendLink(invite.code, base)}`;
}

/** The free-days line, or null when the gym gives none. */
export function friendRewardLine(days: number | null): string | null {
  if (!days) return null;
  return `When a friend joins, your gym can add ${days} free ${days === 1 ? 'day' : 'days'} to your plan.`;
}

export function friendJoinedLine(joined: number): string {
  return `Friends who joined: ${joined}`;
}

/**
 * QA builds only (qa-device.yml writes extra.qaStandIns = ['friendInvite'] into app.json before it builds the
 * emulator APK; store and GitHub builds never carry it): while the gym's server has no 0056, the card shows
 * this made-up answer so the device UAT can see the card, its words and the share menu. The card then says
 * on screen that it is test data. Once 0056 is live the real answer wins and this is never used.
 */
export const QA_STAND_IN_NOTE = "Test build: made-up numbers, because your gym's server does not have this yet.";

export function qaStandInInvite(gymName: string): FriendInvite {
  return { code: 'QATEST23', gymName, rewardDays: 7, joined: 2 };
}

/** True when this build was made for the device UAT with the friend-invite stand-in. PURE. */
export function hasQaStandIn(extra: unknown): boolean {
  const list = extra && typeof extra === 'object' ? (extra as { qaStandIns?: unknown }).qaStandIns : undefined;
  return Array.isArray(list) && list.includes('friendInvite');
}
