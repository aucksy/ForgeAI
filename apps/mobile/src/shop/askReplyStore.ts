/**
 * R-533 "Ask about your workout": the red count of gym replies the member has not opened yet, kept apart from
 * askReplySync.ts so the tab bar can read it without loading the server calls (as gymTalkStore.ts does for
 * "Message your gym"). Not saved on the phone: asked again at every start (askReplySync.refreshAskUnread).
 */
import { create } from 'zustand';

export interface AskReplyState {
  /** The member the count belongs to (a phone that left and joined again starts at 0). */
  memberId: string | null;
  unread: number;
}

export const useAskReplies = create<AskReplyState>(() => ({ memberId: null, unread: 0 }));

/** The Gym tab's extra count for this member (0 for another member or none). */
export function askUnreadFor(s: AskReplyState, memberId: string | null): number {
  return memberId && s.memberId === memberId ? s.unread : 0;
}

/** Keep the count (no new state when nothing changed, so nothing redraws). */
export function setAskUnread(memberId: string | null, unread: number): void {
  const s = useAskReplies.getState();
  const n = memberId ? Math.max(0, Math.floor(unread)) : 0;
  if (s.memberId !== memberId || s.unread !== n) useAskReplies.setState({ memberId, unread: n });
}
