/**
 * Gym notices that pop up on the phone: the words a member reads (pop-up, notification channel,
 * the Settings switch). Pure; the pop-up is made in noticeAlertsRun.ts.
 */
import type { InboxMessage } from './inbox';
import { MAX_SEPARATE_POPUPS } from './noticeAlerts';

export const NOTICE_CHANNEL_NAME = 'Messages from your gym';
export const NOTICE_CHANNEL_DESCRIPTION = 'News from your gym: a holiday, new timings or an offer';

export const NOTICE_SWITCH_TITLE = 'Messages from my gym';
export const NOTICE_BLOCKED_TITLE = 'Notifications are off for MettleUp';
export const NOTICE_BLOCKED_SUB = "No message from your gym can pop up. Turn them on in your phone's settings.";

/** The longest line a pop-up shows before it is cut. */
export const NOTICE_BODY_MAX = 120;

/** The line under the switch. */
export function noticeSwitchCaption(gym: string): string {
  const name = gym.trim() || 'your gym';
  return `Get a pop-up when ${name} sends news, like a holiday, new timings or an offer. It can take a few minutes to reach you.`;
}

/** The first line of a notice's title, cut to fit a pop-up. PURE. */
export function noticeLine(title: string): string {
  const first = (title.split(/\r?\n/).find((l) => l.trim()) ?? '').replace(/\s+/g, ' ').trim();
  if (first.length <= NOTICE_BODY_MAX) return first;
  return `${first.slice(0, NOTICE_BODY_MAX - 1).trimEnd()}…`;
}

export interface NoticePopup {
  /** The same notice always gets the same id, so a repeat can never stack a second pop-up. */
  id: string;
  title: string;
  body: string;
}

/**
 * The pop-ups for these new notices: one each, or one for all when there are more than three.
 * Title is the gym's name; the body is the notice's first line. PURE.
 */
export function noticePopups(gymName: string, notices: readonly InboxMessage[]): NoticePopup[] {
  const gym = gymName.trim() || 'Your gym';
  if (notices.length === 0) return [];
  if (notices.length > MAX_SEPARATE_POPUPS) {
    return [{ id: 'gym-notices-many', title: `${notices.length} new messages from ${gym}`, body: 'Tap to read them.' }];
  }
  return notices.map((m) => ({ id: `gym-notice-${m.id}`, title: gym, body: noticeLine(m.title) }));
}
