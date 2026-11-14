/**
 * R-319 item 1: the Gym tab's "Ask a trainer" row (My gym part). Hidden until the gym's server has 0053 and
 * answered once (offline: hidden too, so the tab never shows a row that cannot work). Its second line says
 * when a trainer replied and the member has not opened the page since, or that a question is still waiting.
 * R-505 (owner, 14 Nov 2026): only for members on a running paid gym plan (askTrainer.ts askAccess, read from
 * "My membership"). A pass member (FITPASS, cultpass...) or a member with no plan sees no row. A member whose plan
 * ended sees it locked ("Ask a trainer is for members with a running plan.") with "Renew my plan" under it, which
 * goes where renewing already goes (renewRequest.ts); a tap on the row still opens the old questions and replies.
 * R-533 (owner, 14 Nov 2026): "there was no dot or something in that section". A red count on the icon (the same one
 * "Message your gym" draws, GymTalkRow TalkCount) while a gym reply is unread; the Gym tab adds it to its own badge
 * (askReplySync.ts). Opening the page clears both. The row now reads "Ask about your workout".
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { LinkRow } from '@/components/stats/parts';
import { GhostButton, Icon } from '@/components/ui';
import { color, space } from '@/theme/tokens';

import { ASK_WORDS, askRowSub, askShown, askUnreadCount } from './askTrainer';
import { keepAskUnread, readAskSeen } from './askReplySync';
import { askUnreadFor, useAskReplies } from './askReplyStore';
import { TalkCount } from './GymTalkRow';
import { requestRenew } from './renewRequest';
import type { GymLink } from './types';

type RowState = { sub: string; locked: boolean; renew: boolean };

export function AskTrainerRow({ link, refreshKey }: { link: GymLink; refreshKey: number }) {
  const router = useRouter();
  const [row, setRow] = useState<RowState | null>(null);
  const unread = useAskReplies((s) => askUnreadFor(s, link.memberId));
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.all([import('./trainerSync'), import('./askAccessRead')])
        .then(async ([m, a]): Promise<RowState | null> => {
          const [choices, access] = await Promise.all([m.readAskChoices(link), a.readAskAccess(link)]);
          // Not known (offline) or not for this member (a pass, no plan): no row (askShown, shared with "Message your gym").
          const shown = askShown(!!choices, access);
          // Offline (choices not read): the count stays as it was; a member who may not see the row: no count.
          if (!shown) {
            if (choices && access) keepAskUnread(link.memberId, null, 0, false);
            return null;
          }
          const [list, seen] = await Promise.all([m.readAskQuestions(link), readAskSeen(link.memberId)]);
          keepAskUnread(link.memberId, list, seen, true);
          // R-533: a locked row (the plan ended) still says when a reply waits; its old replies stay readable.
          if (shown.kind === 'locked') return { sub: askUnreadCount(list, seen) > 0 ? ASK_WORDS.rowReplied : ASK_WORDS.locked, locked: true, renew: shown.renew };
          return { sub: askRowSub(list, seen), locked: false, renew: false };
        })
        .then((s) => {
          if (live) setRow(s);
        })
        .catch((e: unknown) => console.warn('[ask] the Gym tab row', e));
      return () => {
        live = false;
      };
      // refreshKey: a pull to refresh asks again.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [link, refreshKey]),
  );
  if (!row) return null;
  return (
    <View style={{ marginTop: space.md, gap: space.sm }}>
      <LinkRow
        title={ASK_WORDS.rowTitle}
        sub={row.sub}
        spoken={unread > 0 ? `${ASK_WORDS.rowTitle}, ${ASK_WORDS.rowSpoken(unread)}, ${row.sub}` : undefined}
        leading={
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: row.locked ? color.surfaceSunken : color.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="chat" size={16} color={row.locked ? color.inkMuted : color.accent} />
            <TalkCount count={unread} testID="ask-reply-unread" />
          </View>
        }
        onPress={() => router.push('/shop/ask')}
      />
      {row.locked && row.renew ? <GhostButton label={ASK_WORDS.renew} onPress={() => requestRenew()} /> : null}
    </View>
  );
}
