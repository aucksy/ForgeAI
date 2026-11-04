/**
 * R-319 item 1: the Gym tab's "Ask a trainer" row (My gym part). Hidden until the gym's server has 0053 and
 * answered once (offline: hidden too, so the tab never shows a row that cannot work). Its second line says
 * when a trainer replied and the member has not opened the page since, or that a question is still waiting.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { LinkRow } from '@/components/stats/parts';
import { Icon } from '@/components/ui';
import { color, space } from '@/theme/tokens';

import { ASK_WORDS, askRowSub } from './askTrainer';
import { readAskSeen } from './AskTrainerScreen';
import type { GymLink } from './types';

export function AskTrainerRow({ link, refreshKey }: { link: GymLink; refreshKey: number }) {
  const router = useRouter();
  const [sub, setSub] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void import('./trainerSync')
        .then(async (m) => {
          const choices = await m.readAskChoices(link);
          if (!choices) return null;
          const [list, seen] = await Promise.all([m.readAskQuestions(link), readAskSeen(link.memberId)]);
          return askRowSub(list, seen);
        })
        .then((s) => {
          if (live) setSub(s);
        })
        .catch((e: unknown) => console.warn('[ask] the Gym tab row', e));
      return () => {
        live = false;
      };
      // refreshKey: a pull to refresh asks again.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [link, refreshKey]),
  );
  if (!sub) return null;
  return (
    <View style={{ marginTop: space.md }}>
      <LinkRow
        title={ASK_WORDS.rowTitle}
        sub={sub}
        leading={
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chat" size={16} color={color.accent} />
          </View>
        }
        onPress={() => router.push('/shop/ask')}
      />
    </View>
  );
}
