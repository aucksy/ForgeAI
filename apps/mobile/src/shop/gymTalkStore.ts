/**
 * "Message your gym" (0069): the red count, kept apart from gymTalkSync.ts so the tab bar can read it without
 * loading the server calls. Not saved on the phone: asked again at every start (gymTalkSync.refreshTalkUnread).
 */
import { create } from 'zustand';

export interface TalkState {
  /** The member the count belongs to (a phone that left and joined again starts at 0). */
  memberId: string | null;
  unread: number;
  /** 'live': the server has 0069; 'standIn': a QA build's pretend gym; null: not known yet or hidden. */
  mode: 'live' | 'standIn' | null;
}

export const useGymTalk = create<TalkState>(() => ({ memberId: null, unread: 0, mode: null }));

/** The Gym tab's extra count for this member (0 when hidden or another member). */
export function talkUnreadFor(s: TalkState, memberId: string | null): number {
  return memberId && s.memberId === memberId && s.mode ? s.unread : 0;
}
