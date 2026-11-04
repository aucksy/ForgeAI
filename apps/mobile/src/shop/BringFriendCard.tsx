/**
 * F147: the Gym tab's "Bring a friend" card (My gym part). Hidden until the gym's server has 0056 and answered
 * once; hidden offline too (the link needs the member's code from the server), for a member who left, and for a
 * paused gym. The button opens the phone's share menu with a short ready message and the member's own link.
 * Words and the share text: bringFriend.ts.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, Text, View } from 'react-native';

import { Card, GhostButton } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { FRIEND_WORDS, friendJoinedLine, friendMessage, friendRewardLine, type FriendInvite } from './bringFriend';
import { apiFriendInvite } from './gymApi';
import type { GymLink } from './types';

/** Remembered for the app's life once the server says it has no invites yet (no call on every visit). */
let serverMissing = false;

export function BringFriendCard({ link, refreshKey }: { link: GymLink; refreshKey: number }) {
  const [invite, setInvite] = useState<FriendInvite | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (serverMissing) return;
      let live = true;
      apiFriendInvite(link.memberKey)
        .then((r) => {
          if (!live) return;
          if (r.ok) {
            setInvite(r.data);
            return;
          }
          if ('missing' in r) {
            serverMissing = true;
            console.log('[friend] the gym server has no "Bring a friend" yet (0056 not live)');
            setInvite(null);
          } else if ('refused' in r) {
            setInvite(null);
          } else if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') {
            console.warn('[friend] could not read the invite', r.error.kind);
          }
        })
        .catch((e: unknown) => console.warn('[friend] reading the invite failed', e));
      return () => {
        live = false;
      };
      // refreshKey: a pull to refresh asks again.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [link, refreshKey]),
  );
  if (!invite) return null;
  const reward = friendRewardLine(invite.rewardDays);
  const share = (): void => {
    Share.share({ message: friendMessage({ code: invite.code, gymName: invite.gymName || link.gymName }) }).catch((e: unknown) => {
      console.warn('[friend] share did not open', e);
    });
  };
  return (
    <Card style={{ gap: space.sm, marginTop: space.md }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
        {FRIEND_WORDS.title}
      </Text>
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{FRIEND_WORDS.body}</Text>
      {reward ? <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{reward}</Text> : null}
      <View>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>{friendJoinedLine(invite.joined)}</Text>
      </View>
      <GhostButton label={FRIEND_WORDS.button} icon="send" onPress={share} />
    </Card>
  );
}
