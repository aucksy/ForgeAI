/**
 * The Gym tab's ONE "Message your gym" row (My gym part). Owner request 12 Nov 2026 (0069); since R-549 (owner, 14 Nov
 * 2026, option A) it also stands for "Ask about your workout" (0053), which had a row of its own before. The page
 * then asks who it is for: "The gym" or "A trainer" (gymMessages.ts).
 *  - Shown when at least one side can be used now (messageSides): the gym's server has "Message your gym" (0069, or
 *    a QA build's pretend gym), or the member may ask a trainer today (R-505 askShown 'open': 0053 and a running paid
 *    plan). Neither: no row (offline the first time too, so the tab never shows a row that cannot work).
 *  - One red count on its icon: the gym's unread replies plus the trainers' unread replies (the Gym tab adds the
 *    same two to its own badge, TrackerTabBar). A member whose plan ended still gets the count of a trainer's reply
 *    (it shows in the page's list); a pass member or a member with no plan gets none (askReplySync).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { LinkRow } from '@/components/stats/parts';
import { Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { askShown, openQuestion } from './askTrainer';
import { keepAskUnread, readAskSeen } from './askReplySync';
import { askUnreadFor, useAskReplies } from './askReplyStore';
import { MSG_WORDS, messageSides, messagesRowSub, messagesUnread } from './gymMessages';
import { TALK_WORDS } from './gymTalk';
import { refreshTalkUnread, talkUnreadFor, useGymTalk } from './gymTalkSync';
import type { GymLink } from './types';

export const TALK_DOT = 18;

/** The red count (never more than "9+"). Drawn by the row and nowhere else; the Gym tab adds it to its own badge. */
export function TalkCount({ count, testID = 'gym-talk-unread' }: { count: number; testID?: string }) {
  if (count <= 0) return null;
  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -5,
        right: -7,
        minWidth: TALK_DOT,
        height: TALK_DOT,
        paddingHorizontal: 4,
        borderRadius: TALK_DOT / 2,
        backgroundColor: color.critical,
        borderWidth: 1.5,
        borderColor: color.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text allowFontScaling={false} style={{ fontFamily: type.bodyBold, fontSize: 10, lineHeight: 12, color: color.onAccent }}>
        {count > 9 ? '9+' : String(count)}
      </Text>
    </View>
  );
}

/** The trainer half, as the row last read it: may the member ask now, and is a question still waiting? */
type AskRow = { open: boolean; waiting: boolean };

export function GymTalkRow({ link, refreshKey }: { link: GymLink; refreshKey: number }) {
  const router = useRouter();
  const mode = useGymTalk((s) => (s.memberId === link.memberId ? s.mode : null));
  const talkUnread = useGymTalk((s) => talkUnreadFor(s, link.memberId));
  const askUnread = useAskReplies((s) => askUnreadFor(s, link.memberId));
  const [ask, setAsk] = useState<AskRow | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      // The Gym tab opening (or a pull) asks at once.
      void refreshTalkUnread(link, { force: true });
      void Promise.all([import('./trainerSync'), import('./askAccessRead')])
        .then(async ([m, a]): Promise<AskRow | null> => {
          const [choices, access] = await Promise.all([m.readAskChoices(link), a.readAskAccess(link)]);
          const shown = askShown(!!choices, access);
          // Offline (choices not read): the count stays as it was; a member who may not ask at all (a pass, no plan): no count.
          if (!shown) {
            if (choices && access) keepAskUnread(link.memberId, null, 0, false);
            return null;
          }
          const [list, seen] = await Promise.all([m.readAskQuestions(link), readAskSeen(link.memberId)]);
          // A plan that ended: no "A trainer" choice, but a trainer's reply still counts (it shows in the list).
          keepAskUnread(link.memberId, list, seen, true);
          return { open: shown.kind === 'open', waiting: !!list && openQuestion(list) != null };
        })
        .then((s) => {
          if (live) setAsk(s);
        })
        .catch((e: unknown) => console.warn('[talk] the Gym tab row (trainer side)', e));
      return () => {
        live = false;
      };
      // refreshKey: a pull to refresh asks again.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [link, refreshKey]),
  );
  const sides = messageSides(!!mode, ask?.open === true);
  if (sides.length === 0) return null;
  const unread = messagesUnread(talkUnread, askUnread);
  const sub = messagesRowSub(sides, unread, ask?.waiting === true);
  return (
    <View style={{ marginTop: space.md }}>
      <LinkRow
        title={MSG_WORDS.rowTitle}
        sub={sub}
        spoken={unread > 0 ? `${MSG_WORDS.rowTitle}, ${TALK_WORDS.rowSpoken(unread)}, ${sub}` : undefined}
        leading={
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="send" size={16} color={color.accent} />
            <TalkCount count={unread} />
          </View>
        }
        // The page opens on "The gym" when it is there; a member who can only ask a trainer lands there.
        onPress={() => router.push(sides.includes('gym') ? '/shop/message' : '/shop/ask')}
      />
    </View>
  );
}
