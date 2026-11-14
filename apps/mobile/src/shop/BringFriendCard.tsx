/**
 * F147: the Gym tab's "Bring a friend" card (My gym part). Hidden until the gym's server has 0056 and answered
 * once; hidden offline too (the link needs the member's code from the server), for a member who left, and for a
 * paused gym. The button opens the phone's share menu with a short ready message and the member's own link.
 * Words and the share text: bringFriend.ts.
 */
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, Text, View } from 'react-native';

import { Card, GhostButton } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { hasQaPassStandIn, withQaPassStandIn } from './membership';
import { readKeptMembership } from './membershipKept';
import { FRIEND_WORDS, QA_STAND_IN_NOTE, friendJoinedLine, friendMessage, friendRewardLine, hasQaStandIn, qaStandInInvite, type FriendInvite } from './bringFriend';
import { friendLinkBase, knownFriendLinkBase } from './friendLinkBase';
import { apiFriendInvite } from './gymApi';
import type { GymLink } from './types';

/** Remembered for the app's life once the server says it has no invites yet (no call on every visit). */
let serverMissing = false;
/** A device-UAT build (qa-device.yml): show the made-up answer while the server has no 0056. */
const QA_STAND_IN = hasQaStandIn(Constants.expoConfig?.extra);
/** A device-UAT build that reads the gym's stand-in plan as a pass (flow 14). */
const QA_PASS = hasQaPassStandIn(Constants.expoConfig?.extra);

export function BringFriendCard({ link, refreshKey }: { link: GymLink; refreshKey: number }) {
  const [invite, setInvite] = useState<FriendInvite | null>(null);
  const [standIn, setStandIn] = useState(false);
  // F123: a pass member (FITPASS, cultpass...) has no plan, so free days cannot be added: no reward line.
  const [onPass, setOnPass] = useState(false);
  // R-539: join.mettleup.fit once the panel's Worker says so; app.mettleup.fit until then (and offline).
  const [base, setBase] = useState(knownFriendLinkBase);
  useFocusEffect(
    useCallback(() => {
      // The kept answer can be written by other cards without the QA stand-in, and after this card asks:
      // read it as the stand-in build does, now and again once the invite has come back.
      const readPass = (): void => {
        readKeptMembership(link.memberId)
          .then((k) => {
            const a = k ? withQaPassStandIn(k.answer, QA_PASS) : null;
            setOnPass(Boolean(a && a.ok && a.pass));
          })
          .catch(() => setOnPass(false));
      };
      readPass();
      const showStandIn = (): void => {
        if (!QA_STAND_IN) return;
        setInvite(qaStandInInvite(link.gymName));
        setStandIn(true);
      };
      if (serverMissing) {
        setTimeout(readPass, 1500);
        showStandIn();
        return;
      }
      let live = true;
      void friendLinkBase().then((b) => {
        if (live) setBase(b);
      });
      apiFriendInvite(link.memberKey)
        .then((r) => {
          if (!live) return;
          readPass();
          if (r.ok) {
            setInvite(r.data);
            setStandIn(false);
            return;
          }
          if ('missing' in r) {
            serverMissing = true;
            console.log('[friend] the gym server has no "Bring a friend" yet (0056 not live)');
            setInvite(null);
            showStandIn();
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
  const reward = onPass ? null : friendRewardLine(invite.rewardDays);
  const share = (): void => {
    Share.share({ message: friendMessage({ code: invite.code, gymName: invite.gymName || link.gymName }, base) }).catch((e: unknown) => {
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
      {standIn ? <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>{QA_STAND_IN_NOTE}</Text> : null}
    </Card>
  );
}
