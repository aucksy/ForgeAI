/**
 * The Gym tab's "Message your gym" row (My gym part; owner request 12 Nov 2026). Hidden until the gym's server has
 * 0069 and answered once (offline the first time: hidden too, so the tab never shows a row that cannot work). A red
 * count on its icon, and its second line, say when the gym replied and the member has not read it yet.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Text, View } from 'react-native';

import { LinkRow } from '@/components/stats/parts';
import { Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { TALK_WORDS, talkRowSub } from './gymTalk';
import { refreshTalkUnread, talkUnreadFor, useGymTalk } from './gymTalkSync';
import type { GymLink } from './types';

export const TALK_DOT = 18;

/** The red count (never more than "9+"). Drawn by the row and nowhere else; the Gym tab adds it to its own badge. */
export function TalkCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View
      testID="gym-talk-unread"
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

export function GymTalkRow({ link, refreshKey }: { link: GymLink; refreshKey: number }) {
  const router = useRouter();
  const mode = useGymTalk((s) => (s.memberId === link.memberId ? s.mode : null));
  const unread = useGymTalk((s) => talkUnreadFor(s, link.memberId));
  useFocusEffect(
    useCallback(() => {
      // The Gym tab opening (or a pull) asks at once.
      void refreshTalkUnread(link, { force: true });
      // refreshKey: a pull to refresh asks again.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [link, refreshKey]),
  );
  if (!mode) return null;
  const sub = talkRowSub(unread);
  return (
    <View style={{ marginTop: space.md }}>
      <LinkRow
        title={TALK_WORDS.rowTitle}
        sub={sub}
        spoken={unread > 0 ? `${TALK_WORDS.rowTitle}, ${TALK_WORDS.rowSpoken(unread)}, ${sub}` : undefined}
        leading={
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="send" size={16} color={color.accent} />
            <TalkCount count={unread} />
          </View>
        }
        onPress={() => router.push('/shop/message')}
      />
    </View>
  );
}
